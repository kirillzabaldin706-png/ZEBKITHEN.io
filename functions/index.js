const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const YOOKASSA_API = 'https://api.yookassa.ru/v3/payments';

function getYooKassaCreds() {
  const shopId = process.env.YOOKASSA_SHOP_ID || functions.config().yookassa?.shop_id;
  const secretKey = process.env.YOOKASSA_SECRET_KEY || functions.config().yookassa?.secret_key;
  if (!shopId || !secretKey) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'ЮKassa не настроена. Укажите YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY в Firebase Functions.'
    );
  }
  return { shopId, secretKey };
}

exports.createYooKassaPayment = functions
  .region('europe-west1')
  .https.onCall(async (data) => {
    const { amount, items, customer, orderType, returnUrl } = data;
    if (!amount || amount < 1) {
      throw new functions.https.HttpsError('invalid-argument', 'Некорректная сумма');
    }
    if (!customer?.name || !customer?.phone) {
      throw new functions.https.HttpsError('invalid-argument', 'Укажите имя и телефон');
    }

    const { shopId, secretKey } = getYooKassaCreds();
    const idempotenceKey = 'zeb_' + Date.now() + '_' + Math.random().toString(36).slice(2);

    const orderRef = await db.collection('orders').add({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      items: items || [],
      total: amount,
      type: orderType || 'restaurant',
      payment: 'yookassa',
      paymentLabel: 'ЮKassa (онлайн)',
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const auth = Buffer.from(shopId + ':' + secretKey).toString('base64');
    const description = 'Заказ ZEB Kitchen #' + orderRef.id.slice(-6);

    const body = {
      amount: { value: amount.toFixed(2), currency: 'RUB' },
      capture: true,
      confirmation: {
        type: 'redirect',
        return_url: returnUrl || 'https://zeb-kitchen-5b864.web.app/?payment=success'
      },
      description,
      metadata: { orderId: orderRef.id, phone: customer.phone },
      receipt: {
        customer: {
          full_name: customer.name,
          phone: customer.phone.replace(/\D/g, '').replace(/^7/, '+7')
        },
        items: (items || []).map(i => ({
          description: i.name.slice(0, 128),
          quantity: String(i.qty || 1),
          amount: { value: (i.price * (i.qty || 1)).toFixed(2), currency: 'RUB' },
          vat_code: 1,
          payment_mode: 'full_payment',
          payment_subject: 'commodity'
        }))
      }
    };

    const res = await fetch(YOOKASSA_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + auth,
        'Idempotence-Key': idempotenceKey
      },
      body: JSON.stringify(body)
    });

    const payment = await res.json();
    if (!res.ok) {
      await orderRef.update({ status: 'error', error: payment.description || 'Payment failed' });
      throw new functions.https.HttpsError('internal', payment.description || 'Ошибка ЮKassa');
    }

    await orderRef.update({
      yookassaPaymentId: payment.id,
      status: 'awaiting_payment'
    });

    return {
      orderId: orderRef.id,
      paymentId: payment.id,
      confirmationUrl: payment.confirmation?.confirmation_url
    };
  });

exports.yookassaWebhook = functions
  .region('europe-west1')
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const event = req.body?.event;
    const payment = req.body?.object;
    if (!payment?.id) {
      res.status(400).send('Bad Request');
      return;
    }

    const snap = await db.collection('orders')
      .where('yookassaPaymentId', '==', payment.id)
      .limit(1)
      .get();

    if (!snap.empty) {
      const doc = snap.docs[0];
      if (event === 'payment.succeeded') {
        await doc.ref.update({ status: 'paid', paidAt: admin.firestore.FieldValue.serverTimestamp() });
      } else if (event === 'payment.canceled') {
        await doc.ref.update({ status: 'cancelled' });
      }
    }

    res.status(200).send('OK');
  });
