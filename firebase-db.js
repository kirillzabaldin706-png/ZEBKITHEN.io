import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, onSnapshot, serverTimestamp, query, orderBy, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBlLgBGbd8vihc702chK780oJkzIo4jjgs',
  authDomain: 'zeb-kitchen-5b864.firebaseapp.com',
  projectId: 'zeb-kitchen-5b864',
  storageBucket: 'zeb-kitchen-5b864.firebasestorage.app',
  messagingSenderId: '383048754360',
  appId: '1:383048754360:web:4bb660751446271fcf404d',
  measurementId: 'G-9L760BJVZL'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, 'europe-west1');

const MENU_DOC = doc(db, 'menu', 'main');

export const DEFAULT_MENU = {
  categories: [
    { id: 'starters', name: 'Закуски' },
    { id: 'mains', name: 'Основные блюда' },
    { id: 'desserts', name: 'Десерты' },
    { id: 'drinks', name: 'Напитки' }
  ],
  items: [
    { id: 1, category: 'starters', name: 'Брускетта с авокадо и креветкой', desc: 'Свежий хлеб, домашний авокадо-крем, тигровая креветка', price: 590, image: 'images/bruschetta.jpg' },
    { id: 2, category: 'starters', name: 'Тартар из говядины с соусом «Маттака»', desc: 'Мясо выдержанное, соус из японского майонеза, васаби и кунжута', price: 750, image: 'images/main.jpg' },
    { id: 3, category: 'mains', name: 'Форель на гриле с сезонными овощами', desc: 'Свежая форель, запечённые овощи, соус из цитрусов', price: 1290, image: 'images/min.jpg' },
    { id: 4, category: 'mains', name: 'Стейк из говядины «Рибай»', desc: 'Выдержанный стейк, картофельное пюре, красное вино-соус', price: 1890, image: 'images/man.jpg' },
    { id: 5, category: 'desserts', name: 'Классическое тирамису', desc: 'Маскарпоне, эспрессо, какао, печенье «Савоярди»', price: 490, image: 'images/sin.jpg' },
    { id: 6, category: 'desserts', name: 'Нью-Йорк чизкейк с ягодным соусом', desc: 'Плотный сырный корж, свежие ягоды, домашний соус', price: 550, image: 'images/san.jpg' },
    { id: 7, category: 'drinks', name: 'Авторский кофе от местной обжарки', desc: 'Эфиопия, Йиргачеффе, фильтр или эспрессо', price: 350, image: 'images/vin.jpg' },
    { id: 8, category: 'drinks', name: 'Коктейль «Цитрус & Травы»', desc: 'Джин, лайм, базилик, медовый сироп, тоник', price: 650, image: 'images/van.jpg' }
  ]
};

export function menuToZebFormat(menu) {
  const result = {};
  (menu.categories || []).forEach(c => { result[c.id] = []; });
  (menu.items || []).forEach(item => {
    if (!result[item.category]) result[item.category] = [];
    result[item.category].push({
      id: String(item.id),
      name: item.name,
      desc: item.desc || '',
      price: item.price,
      img: item.image || ''
    });
  });
  return result;
}

export function menuFromZebFormat(zebMenu) {
  const categories = [
    { id: 'starters', name: 'Закуски' },
    { id: 'mains', name: 'Основные блюда' },
    { id: 'desserts', name: 'Десерты' },
    { id: 'drinks', name: 'Напитки' }
  ];
  const items = [];
  let id = 1;
  for (const cat in zebMenu) {
    (zebMenu[cat] || []).forEach(d => {
      items.push({
        id: id++,
        category: cat,
        name: d.name,
        desc: d.desc || '',
        price: d.price,
        image: d.img || d.image || ''
      });
    });
  }
  return { categories, items };
}

export async function getMenuFromCloud() {
  const snap = await getDoc(MENU_DOC);
  if (snap.exists()) return snap.data();
  await setDoc(MENU_DOC, { ...DEFAULT_MENU, updatedAt: serverTimestamp() });
  return JSON.parse(JSON.stringify(DEFAULT_MENU));
}

export async function saveMenuToCloud(menu) {
  await setDoc(MENU_DOC, { ...menu, updatedAt: serverTimestamp() });
}

export function subscribeMenu(callback) {
  return onSnapshot(MENU_DOC, snap => {
    if (snap.exists()) callback(snap.data());
  }, err => console.warn('Menu subscribe error:', err));
}

export async function saveBooking(data) {
  return addDoc(collection(db, 'bookings'), {
    ...data,
    createdAt: serverTimestamp()
  });
}

export function listenBookings(callback) {
  const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, err => {
    console.warn('Bookings listen error:', err);
    callback([]);
  });
}

export async function saveOrder(data) {
  return addDoc(collection(db, 'orders'), {
    ...data,
    status: data.status || 'new',
    createdAt: serverTimestamp()
  });
}

export function listenOrders(callback) {
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, err => {
    console.warn('Orders listen error:', err);
    callback([]);
  });
}

export async function updateOrderStatus(orderId, status) {
  await updateDoc(doc(db, 'orders', orderId), { status, updatedAt: serverTimestamp() });
}

export async function uploadPhoto(file) {
  const name = 'menu/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageRef = ref(storage, name);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function createYooKassaPayment({ total, items, name, phone, email, type }) {
  const fn = httpsCallable(functions, 'createYooKassaPayment');
  const result = await fn({
    amount: total,
    items: items.map(i => ({ name: i.name, price: i.price, qty: i.qty || 1 })),
    customer: { name, phone, email: email || '' },
    orderType: type || 'restaurant',
    returnUrl: window.location.origin + window.location.pathname + '?payment=success'
  });
  return result.data;
}
