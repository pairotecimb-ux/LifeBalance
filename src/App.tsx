import React, { useState, useEffect, useMemo } from 'react';
import {
  PieChart as IconPieChart, CreditCard, Plus, Trash2, Wallet, LayoutDashboard, List, Settings, Upload, Download,
  CheckCircle2, XCircle, TrendingUp, DollarSign, Calendar, ChevronRight, Filter,
  ArrowRightLeft, Landmark, Coins, Edit2, Save, Building, MoreHorizontal, Search, X, LogOut, Lock, Info, Repeat, RefreshCw, UserCircle, Tag, User as UserIcon
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
  getFirestore, collection, addDoc, query, onSnapshot, deleteDoc, doc, updateDoc,
  serverTimestamp, writeBatch, orderBy, increment, setDoc
} from 'firebase/firestore';

// --- Configuration ---
const firebaseConfig = {
  apiKey: 'AIzaSyCSUj4FDV8xMnNjKcAtqBx4YMcRVznqV-E',
  authDomain: 'credit-card-manager-b95c8.firebaseapp.com',
  projectId: 'credit-card-manager-b95c8',
  storageBucket: 'credit-card-manager-b95c8.firebasestorage.app',
  messagingSenderId: '486114228268',
  appId: '1:486114228268:web:6d00ae1430aae1e252b989',
};

// Initialize Firebase safely
let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) { console.error("Firebase Init Error", e); }

const APP_VERSION = "v13.0.0 (Final Redemption)";
const appId = 'credit-manager-pro-v13';

// --- Types ---
type AccountType = 'credit' | 'bank' | 'cash';

interface Account {
  id: string;
  name: string;
  bank: string;
  type: AccountType;
  accountNumber?: string;
  cardType?: string;
  limit?: number;        
  balance: number;       
  totalDebt?: number;    
  statementDay?: number;
  dueDay?: number;
  color: string;
}

interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;          
  accountId: string;     
  toAccountId?: string;  
  status: 'paid' | 'unpaid';
  category: string;
  type: 'expense' | 'income' | 'transfer';
  installment?: string;
}

interface RecurringItem {
  id: string;
  description: string;
  amount: number;
  accountId: string;
  category: string;
  day: number;
}

// --- Helpers ---
const safeNumber = (val: any) => { const num = parseFloat(val); return isNaN(num) ? 0 : num; };
const formatCurrency = (val: any) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(safeNumber(val));
const formatDate = (date: any) => { try { return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }).format(new Date(date)); } catch (e) { return '-'; } };
const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const getThaiMonthName = (dateStr: string) => {
  if (!dateStr) return 'ทั้งหมด';
  try {
    const date = new Date(dateStr + '-01');
    if (isNaN(date.getTime())) return dateStr;
    return `${THAI_MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`;
  } catch (e) { return dateStr; }
};
const parseThaiMonthToDate = (str: string) => {
    if (!str) return new Date().toISOString().split('T')[0];
    try {
        const parts = str.trim().split(/[-/]/);
        if (parts.length < 2) return new Date().toISOString().split('T')[0];
        let mStr = parts[0], yStr = parts[1];
        if(!isNaN(Number(mStr)) && mStr.length === 4) { return `${mStr}-${yStr.padStart(2,'0')}-01`; } // already YYYY-MM
        const shortMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        const monthIndex = shortMonths.findIndex(m => mStr.includes(m));
        let year = parseInt(yStr);
        if (year < 100) year += 2500; year -= 543;
        if (monthIndex > -1 && !isNaN(year)) {
             const m = (monthIndex + 1).toString().padStart(2, '0');
             return `${year}-${m}-01`;
        }
    } catch (e) {}
    return new Date().toISOString().split('T')[0];
};
const fixScientificNotation = (str: string) => {
    if (!str) return '';
    let cleanStr = str.toUpperCase();
    if (cleanStr.includes('+') && !cleanStr.includes('E')) cleanStr = cleanStr.replace('+', 'E+');
    if (cleanStr.includes('E')) {
        const num = Number(cleanStr);
        if (!isNaN(num)) return num.toLocaleString('fullwide', { useGrouping: false });
    }
    return str;
};
const getBankColor = (bankName: string) => {
    const colors: any = { 'ไทยพาณิชย์': 'from-purple-700 to-purple-900', 'SCB': 'from-purple-700 to-purple-900', 'กสิกร': 'from-emerald-600 to-emerald-800', 'Kbank': 'from-emerald-600 to-emerald-800', 'กรุงศรี': 'from-yellow-600 to-yellow-800', 'กรุงเทพ': 'from-blue-700 to-blue-900', 'BBL': 'from-blue-700 to-blue-900', 'เงินสด': 'from-green-600 to-green-800' };
    const key = Object.keys(colors).find(k => bankName?.toLowerCase().includes(k.toLowerCase()));
    return colors[key || ''] || 'from-slate-600 to-slate-800';
};
const DEFAULT_CATEGORIES = ['ทั่วไป', 'อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'บิล/สาธารณูปโภค', 'ผ่อนสินค้า', 'สุขภาพ', 'บันเทิง', 'เงินเดือน', 'อื่นๆ'];

// --- Main Component ---
export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [recurringItems, setRecurringItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(false);

  // UI States
  const [showAddTx, setShowAddTx] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showCategoryMgr, setShowCategoryMgr] = useState(false);
  const [showTxDetail, setShowTxDetail] = useState<any>(null);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  
  // Transaction Form
  const [txForm, setTxForm] = useState<any>({ type: 'expense', amount: '', date: new Date().toISOString().split('T')[0], category: 'ทั่วไป', status: 'unpaid' });
  
  // Filter States
  const [filterMonth, setFilterMonth] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterBank, setFilterBank] = useState('all');

  // Recurring Form
  const [recForm, setRecForm] = useState<any>({ day: 1, amount: '' });
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); });
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsubAcc = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'accounts'), s => setAccounts(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubTx = onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), orderBy('createdAt', 'desc')), s => {
        const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
        setTransactions(data);
        if(!filterMonth && data.length > 0) setFilterMonth(data[0].date.substring(0, 7));
        setLoading(false);
    });
    const unsubRec = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'recurring'), s => setRecurringItems(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubCat = onSnapshot(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'categories'), s => { if(s.exists()) setCategories(s.data().list || DEFAULT_CATEGORIES); });
    return () => { unsubAcc(); unsubTx(); unsubRec(); unsubCat(); };
  }, [user]);

  // Actions
  const handleLogin = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch(e:any) { alert(e.message); } };
  const handleGuest = async () => { try { await signInAnonymously(auth); } catch(e:any) { alert(e.message); } };
  
  const updateBalance = async (accId: string, amount: number) => {
    if(!accId) return;
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'accounts', accId), { balance: increment(amount) });
  };

  const handleSaveTx = async () => {
    if (!user || !txForm.amount || !txForm.accountId) return alert('กรอกข้อมูลไม่ครบ');
    const amount = Number(txForm.amount);
    const isEdit = !!txForm.id;
    
    // Logic: ตัดเงินทันที
    if (isEdit) {
       const old = transactions.find(t => t.id === txForm.id);
       if (old) {
          if (old.type === 'income') await updateBalance(old.accountId, -old.amount);
          else if (old.type === 'expense') await updateBalance(old.accountId, old.amount);
          else if (old.type === 'transfer' && old.toAccountId) { await updateBalance(old.accountId, old.amount); await updateBalance(old.toAccountId, -old.amount); }
       }
    }
    if (txForm.type === 'income') await updateBalance(txForm.accountId, amount);
    else if (txForm.type === 'expense') await updateBalance(txForm.accountId, -amount);
    else if (txForm.type === 'transfer' && txForm.toAccountId) { await updateBalance(txForm.accountId, -amount); await updateBalance(txForm.toAccountId, amount); }

    const payload = { ...txForm, amount, updatedAt: serverTimestamp() };
    if (isEdit) await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', txForm.id), payload);
    else await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), { ...payload, createdAt: serverTimestamp() });
    
    setShowAddTx(false); setTxForm({ type: 'expense', amount: '', date: new Date().toISOString().split('T')[0], category: 'ทั่วไป', status: 'unpaid' });
  };

  const handleDeleteTx = async () => {
    if (!user || !txForm.id) return;
    if (!confirm('ยืนยันลบ? ยอดเงินจะถูกคืนกลับ')) return;
    const old = txForm;
    if (old.type === 'income') await updateBalance(old.accountId, -old.amount);
    else if (old.type === 'expense') await updateBalance(old.accountId, old.amount);
    else if (old.type === 'transfer' && old.toAccountId) { await updateBalance(old.accountId, old.amount); await updateBalance(old.toAccountId, -old.amount); }
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', old.id));
    setShowAddTx(false);
  };

  const handleImport = (e: any) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
       try {
          let text = "";
          try { text = new TextDecoder('utf-8').decode(ev.target?.result as ArrayBuffer); } catch {}
          if (!text.includes('ประเภทบัญชี')) { try { text = new TextDecoder('windows-874').decode(ev.target?.result as ArrayBuffer); } catch {} }
          const lines = text.split(/\r\n|\n/).filter(l => l.trim());
          const headerIdx = lines.findIndex(l => l.includes('ประเภทบัญชี'));
          if (headerIdx === -1) throw new Error('ไม่พบหัวตาราง');
          const headers = lines[headerIdx].split(',').map(h => h.trim().replace(/"/g, ''));
          const getCol = (k: string) => headers.findIndex(h => h.includes(k));
          
          const batch = writeBatch(db);
          const existing = new Map(accounts.map(a => [`${a.bank}-${a.name}`, a.id]));
          const newCache = new Map();
          let count = 0;

          for (let i = headerIdx + 1; i < lines.length; i++) {
             const row = lines[i].split(','); if(row.length<5) continue;
             const clean = (i:number) => i > -1 ? row[i].replace(/"/g,'').trim() : '';
             const num = (i:number) => parseFloat(clean(i).replace(/,/g,'')) || 0;
             
             const name = clean(getCol('ชื่อบัตร')) || 'General';
             const bank = clean(getCol('ธนาคาร')) || 'Other';
             const typeRaw = clean(getCol('ประเภทบัญชี'));
             const balanceVal = num(getCol('ยอดเงินในบัญชี'));
             // Logic แยกประเภท: ถ้ามีเงินในบัญชี > 0 = Bank
             const type = (typeRaw.includes('บัญชี') || bank.includes('ธนาคาร') || balanceVal > 0) ? 'bank' : typeRaw.includes('เงินสด') ? 'cash' : 'credit';
             const key = `${bank}-${name}`;
             
             let accId = existing.get(key) || newCache.get(key);
             if (name && name !== 'N/A') {
                 const accData: any = { 
                    name, bank, type, color: getBankColor(bank),
                    accountNumber: fixScientificNotation(clean(getCol('เลขบัตร'))),
                    totalDebt: num(getCol('ภาระหนี้'))
                 };
                 accData.limit = num(getCol('วงเงินทั้งหมด')) || 0;
                 if (type === 'credit') {
                    const limitRem = num(getCol('วงเงินคงเหลือ'));
                    const limitUsed = num(getCol('วงเงินที่ใช้ไป'));
                    // แก้หนี้เบิ้ล: ถ้าใช้ไป 0 ให้ถือว่าเต็มวงเงิน
                    accData.balance = limitRem > 0 ? limitRem : (limitUsed === 0 ? accData.limit : accData.limit - limitUsed);
                 } else { accData.balance = balanceVal; }
                 
                 if (accId) batch.update(doc(db,'artifacts',appId,'users',user.uid,'accounts',accId), accData);
                 else {
                    const ref = doc(collection(db,'artifacts',appId,'users',user.uid,'accounts'));
                    batch.set(ref, { ...accData, createdAt: serverTimestamp() });
                    accId = ref.id; newCache.set(key, accId);
                 }
             }
             
             const desc = clean(getCol('รายละเอียดค่าใช้จ่าย'));
             const amt = num(getCol('ยอดชำระ'));
             if (accId && desc && desc !== 'ไม่มี' && amt > 0) {
                const txRef = doc(collection(db,'artifacts',appId,'users',user.uid,'transactions'));
                const mStr = clean(getCol('ธุรกรรมเดือน')>-1?getCol('ธุรกรรมเดือน'):getCol('รายการเดือน'));
                batch.set(txRef, {
                   accountId: accId, description: desc, amount: amt,
                   date: mStr ? parseThaiMonthToDate(mStr) : new Date().toISOString().split('T')[0],
                   status: clean(getCol('สถานะ')).includes('จ่ายแล้ว') ? 'paid' : 'unpaid',
                   type: 'expense', category: 'Import', createdAt: serverTimestamp()
                });
                count++;
             }
          }
          await batch.commit();
          alert(`นำเข้าสำเร็จ ${count} รายการ`);
          setShowImport(false);
       } catch (e: any) { alert(e.message); } finally { setImporting(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSaveAccount = async () => {
     if (!user || !editingAccount?.name) return;
     const payload = { ...editingAccount, balance: Number(editingAccount.balance), limit: Number(editingAccount.limit||0), totalDebt: Number(editingAccount.totalDebt||0), color: getBankColor(editingAccount.bank) };
     if (isNewAccount) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'accounts'), { ...payload, createdAt: serverTimestamp() });
     else await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'accounts', editingAccount.id), payload);
     setEditingAccount(null);
  };

  const handleDeleteAccount = async () => {
     if (confirm('ยืนยันลบ?')) {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'accounts', editingAccount.id));
        setEditingAccount(null);
     }
  };

  const handleAddCategory = async () => {
     if(!newCategory) return;
     const newList = [...categories, newCategory];
     await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'categories'), { list: newList });
     setCategories(newList); setNewCategory('');
  };

  const handleDeleteCategory = async (c: string) => {
     if(!confirm('ลบหมวดหมู่?')) return;
     const newList = categories.filter(i => i !== c);
     await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'categories'), { list: newList });
     setCategories(newList);
  };

  // Views
  const availableMonths = useMemo(() => Array.from(new Set(transactions.map(t => t.date.substring(0, 7)))).sort().reverse(), [transactions]);
  const filteredTx = useMemo(() => transactions.filter(t => (!filterMonth || t.date.startsWith(filterMonth)) && (filterType === 'all' || t.type === filterType) && (filterBank === 'all' || accounts.find(a=>a.id===t.accountId)?.bank === filterBank)), [transactions, filterMonth, filterType, filterBank, accounts]);
  
  const totalAssets = accounts.filter(a => a.type !== 'credit').reduce((s, a) => s + a.balance, 0);
  const totalDebt = accounts.reduce((s, a) => s + (a.totalDebt || 0), 0);
  const creditLimit = accounts.filter(a => a.type === 'credit').reduce((s, a) => s + (a.limit || 0), 0);
  const creditBal = accounts.filter(a => a.type === 'credit').reduce((s, a) => s + a.balance, 0);
  
  // Bank Summary
  const bankSummary = useMemo(() => {
    const sum: Record<string, number> = {};
    filteredTx.filter(t => t.type === 'expense').forEach(t => {
       const bank = accounts.find(a => a.id === t.accountId)?.bank || 'Other';
       sum[bank] = (sum[bank] || 0) + t.amount;
    });
    return sum;
  }, [filteredTx, accounts]);

  // Chart Data
  const chartData = useMemo(() => {
    const data: Record<string, number> = {};
    filteredTx.filter(t => t.type === 'expense').forEach(t => data[t.category] = (data[t.category] || 0) + t.amount);
    return Object.entries(data).sort((a,b)=>b[1]-a[1]).map(([name, value], i) => ({ name, value, color: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'][i%5] }));
  }, [filteredTx]);

  if (loading || authLoading) return <div className="h-screen flex items-center justify-center text-slate-400">Loading...</div>;
  if (!user) return (
    <div className="h-screen flex flex-col items-center justify-center p-6 bg-slate-900 text-white text-center">
      <Wallet size={64} className="mb-6 text-blue-400" />
      <h1 className="text-3xl font-bold mb-2">Credit Manager V12</h1>
      <p className="text-slate-400 mb-8">จัดการการเงินให้ง่ายขึ้น</p>
      <div className="space-y-4 w-full max-w-sm">
         <button onClick={handleLogin} className="w-full bg-white text-slate-900 py-3 rounded-xl font-bold flex justify-center items-center gap-2">Google Login</button>
         <button onClick={handleGuest} className="w-full bg-white/10 py-3 rounded-xl font-bold flex justify-center items-center gap-2 border border-white/20">Guest Mode</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 flex justify-center">
      <div className="w-full max-w-md bg-white sm:my-8 sm:rounded-[2.5rem] sm:shadow-2xl sm:border-[8px] sm:border-slate-800 flex flex-col relative overflow-hidden h-[100dvh] sm:h-[850px]">
        {/* Header */}
        <div className="px-6 pt-12 pb-2 bg-white flex justify-between items-center shrink-0 z-20">
           <div><p className="text-[10px] text-slate-400 uppercase">My Wallet</p><p className="font-bold text-lg">Dashboard</p></div>
           <button onClick={() => setActiveTab('settings')} className="p-2 bg-slate-50 rounded-full hover:bg-slate-100"><Settings size={20}/></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 hide-scrollbar bg-white relative z-10 pb-24">
           {activeTab === 'dashboard' && (
             <div className="space-y-6">
                <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl">
                   <div className="flex justify-between items-center mb-4">
                     <p className="text-xs text-slate-400">สรุป {filterMonth ? getThaiMonthName(filterMonth + '-01') : '(ทั้งหมด)'}</p>
                     <select className="bg-white/10 text-xs p-1 rounded text-white border-none" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
                        <option value="">ทั้งหมด</option>
                        {availableMonths.map(m => <option key={m} value={m}>{getThaiMonthName(m + '-01')}</option>)}
                     </select>
                   </div>
                   <h1 className="text-4xl font-bold">{formatCurrency(totalAssets - (creditLimit - creditBal) - totalDebt)}</h1>
                   <div className="grid grid-cols-2 gap-4 mt-6">
                      <div className="bg-white/10 p-3 rounded-xl"><p className="text-[10px] text-emerald-300">สินทรัพย์</p><p className="text-lg font-bold">{formatCurrency(totalAssets)}</p></div>
                      <div className="bg-white/10 p-3 rounded-xl"><p className="text-[10px] text-rose-300">หนี้สิน</p><p className="text-lg font-bold">{formatCurrency((creditLimit - creditBal) + totalDebt)}</p></div>
                   </div>
                </div>
                
                <div className="bg-white border rounded-2xl p-4 shadow-sm">
                   <h3 className="font-bold text-sm mb-4 flex items-center gap-2"><IconPieChart size={16}/> สัดส่วนค่าใช้จ่าย</h3>
                   <div className="flex items-center gap-6">
                      <div className="w-28 h-28 rounded-full flex-none relative shadow-inner" style={{background: `conic-gradient(${chartData.length ? chartData.map((d,i,arr) => { const prev = arr.slice(0,i).reduce((s,x)=>s+x.value,0); const total = arr.reduce((s,x)=>s+x.value,0); return `${d.color} ${(prev/total)*100}% ${((prev+d.value)/total)*100}%` }).join(',') : '#f1f5f9 0% 100%'})`}}></div>
                      <div className="flex-1 space-y-2">{chartData.slice(0,4).map((d,i) => (<div key={i} className="flex justify-between text-xs items-center"><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{background:d.color}}></span>{d.name}</span><span className="font-medium">{formatCurrency(d.value)}</span></div>))}</div>
                   </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl">
                   <h3 className="font-bold mb-3 text-sm">สรุปยอดจ่ายตามธนาคาร</h3>
                   {Object.entries(bankSummary).map(([bank, amt]) => (
                     <div key={bank} className="flex justify-between text-xs mb-1 border-b border-slate-200 pb-1 last:border-0"><span>{bank}</span><span className="font-bold">{formatCurrency(amt)}</span></div>
                   ))}
                   <div className="flex justify-between text-xs font-bold pt-2 border-t mt-2"><span>รวมสุทธิ</span><span>{formatCurrency(Object.values(bankSummary).reduce((a,b)=>a+b,0))}</span></div>
                </div>
             </div>
           )}
           {activeTab === 'wallet' && (
             <div className="pt-4 space-y-6">
                <div className="flex justify-between items-center"><h2 className="text-2xl font-bold">กระเป๋าตังค์</h2><button onClick={() => { setIsNewAccount(true); setEditingAccount({ id: '', name: '', bank: '', type: 'bank', balance: 0, color: 'from-slate-700 to-slate-900' }); }} className="bg-slate-900 text-white p-2 rounded-full shadow"><Plus size={20}/></button></div>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"><button onClick={() => setFilterBank('all')} className={`px-3 py-1 rounded-full text-xs border ${filterBank==='all'?'bg-black text-white':''}`}>ทั้งหมด</button>{[...new Set(accounts.map(a => a.bank))].sort().map(bank => (<button key={bank} onClick={() => setFilterBank(bank)} className={`px-3 py-1 rounded-full text-xs border ${filterBank===bank?'bg-black text-white':''}`}>{bank}</button>))}</div>
                {[...new Set(accounts.filter(a => filterBank === 'all' || a.bank === filterBank).map(a => a.bank))].sort().map(bank => (
                  <div key={bank}>
                    <h3 className="text-sm font-bold text-slate-500 mb-2">{bank}</h3>
                    <div className="space-y-3">{accounts.filter(a => a.bank === bank).map(a => (
                      <div key={a.id} onClick={() => { setIsNewAccount(false); setEditingAccount(a); }} className={`relative p-4 rounded-2xl text-white overflow-hidden bg-gradient-to-br ${a.color} shadow-lg cursor-pointer hover:scale-[1.02] transition-transform`}>
                         <div className="flex justify-between items-start mb-3"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">{a.type === 'bank' ? <Landmark size={14}/> : a.type === 'cash' ? <Coins size={14}/> : <CreditCard size={14}/>}</div><div><p className="text-[10px] opacity-80 uppercase font-medium">{a.bank}</p><p className="font-bold text-lg leading-none">{a.name}</p></div></div><Edit2 size={16} className="opacity-50" /></div>
                         <div className="flex justify-between items-end"><p className="text-xs opacity-70">{a.type === 'credit' ? 'วงเงินคงเหลือ' : 'ยอดเงิน'}</p><p className="text-xl font-bold">{formatCurrency(a.balance)}</p></div>
                         {a.type === 'credit' && <div className="flex justify-between text-[10px] opacity-60 pt-1"><span>ใช้ไป: {formatCurrency((a.limit||0) - a.balance)}</span><span>วงเงิน: {formatCurrency(a.limit||0)}</span></div>}
                      </div>
                    ))}</div>
                  </div>
                ))}
             </div>
           )}
           {activeTab === 'transactions' && (
             <div className="pt-4">
                <div className="flex gap-2 mb-4 overflow-x-auto">
                   <select className="bg-white border rounded text-xs p-2 min-w-[100px]" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}><option value="">ทุกเดือน</option>{availableMonths.map(m => <option key={m} value={m}>{getThaiMonthName(m+'-01')}</option>)}</select>
                   <select className="bg-white border rounded text-xs p-2" value={filterType} onChange={e => setFilterType(e.target.value)}><option value="all">ทุกประเภท</option><option value="expense">รายจ่าย</option><option value="income">รายรับ</option></select>
                </div>
                <div className="space-y-2 mb-8">{filteredTx.map(tx => (
                  <div key={tx.id} onClick={() => { setTxForm(tx); setShowAddTx(true); }} className="bg-white p-4 border rounded-xl flex justify-between items-center cursor-pointer">
                     <div><p className="font-bold text-sm truncate w-40">{tx.description}</p><p className="text-[10px] text-slate-400">{formatDate(tx.date)} • {accounts.find(a=>a.id===tx.accountId)?.name}</p></div>
                     <div className="text-right"><p className={`font-bold ${tx.type==='income'?'text-emerald-600':'text-slate-900'}`}>{tx.type==='expense'?'-':''}{formatCurrency(tx.amount)}</p>{tx.status==='unpaid'&&<span className="text-[9px] bg-amber-100 text-amber-600 px-1 rounded">รอจ่าย</span>}</div>
                  </div>
                ))}</div>
             </div>
           )}
           {activeTab === 'settings' && (
             <div className="pt-4 space-y-4">
                <h2 className="text-2xl font-bold px-1">ตั้งค่า</h2>
                <div className="bg-white rounded-2xl border p-4"><h3 className="font-bold text-sm mb-2">ข้อมูลผู้ใช้</h3><p className="text-sm text-slate-600">{user?.email || 'Guest Mode'}</p></div>
                
                {/* Category Manager */}
                <div className="bg-white rounded-2xl border p-4">
                   <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><Tag size={16}/> จัดการหมวดหมู่</h3>
                   <button onClick={() => setShowCategoryMgr(true)} className="w-full py-2 bg-slate-100 rounded-lg text-xs font-bold text-slate-600">แก้ไขหมวดหมู่</button>
                </div>

                {/* Recurring */}
                <div className="bg-white rounded-2xl border p-4"><h3 className="font-bold text-sm mb-2">รายจ่ายประจำ</h3>
                   <div className="flex gap-2 mb-2"><input placeholder="รายการ" className="flex-[2] p-2 border rounded text-xs" value={recForm.description} onChange={e=>setRecForm({...recForm, description:e.target.value})}/><input type="number" placeholder="บาท" className="w-16 p-2 border rounded text-xs" onChange={e=>setRecForm({...recForm, amount:e.target.value})}/><select className="w-24 p-2 border rounded text-xs" onChange={e=>setRecForm({...recForm, accountId:e.target.value})}><option value="">ตัดผ่าน</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
                   <button onClick={async () => { if(recForm.description) { await addDoc(collection(db,'artifacts',appId,'users',user.uid,'recurring'), {...recForm, amount: Number(recForm.amount)}); setRecForm({day:1,amount:''}); } }} className="w-full py-2 bg-slate-900 text-white rounded text-xs">เพิ่ม</button>
                   <div className="mt-2 space-y-1">{recurringItems.map(r=><div key={r.id} className="flex justify-between text-xs bg-slate-50 p-2 rounded"><span>{r.description} ({formatCurrency(r.amount)})</span><button onClick={()=>deleteDoc(doc(db,'artifacts',appId,'users',user.uid,'recurring',r.id))} className="text-rose-500">x</button></div>)}</div>
                </div>

                <div className="bg-white rounded-2xl border overflow-hidden">
                   <button onClick={() => setShowImport(true)} className="w-full p-4 border-b text-left text-sm flex gap-2"><Upload size={16}/> นำเข้า CSV (Import)</button>
                   <button onClick={() => {
                      const csv = "Date,Type,Description,Amount,Account,Status\n" + transactions.map(t => `${t.date},${t.type},"${t.description}",${t.amount},"${accounts.find(a=>a.id===t.accountId)?.name}",${t.status}`).join('\n');
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a'); link.href = url; link.download = 'backup.csv'; link.click();
                   }} className="w-full p-4 border-b text-left text-sm flex gap-2"><Download size={16}/> ส่งออก CSV (Backup)</button>
                   <button onClick={() => signOut(auth)} className="w-full p-4 text-left text-sm flex gap-2 text-rose-600"><LogOut size={16}/> ออกจากระบบ</button>
                </div>
             </div>
           )}
        </div>

        {/* Bottom Nav */}
        <div className="bg-white border-t py-3 px-6 flex justify-between items-center z-30 pb-6 sm:pb-3 shadow-lg">
           <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 ${activeTab==='dashboard'?'text-slate-900':'text-slate-400'}`}><LayoutDashboard size={24}/><span className="text-[10px]">ภาพรวม</span></button>
           <button onClick={() => setActiveTab('wallet')} className={`flex flex-col items-center gap-1 ${activeTab==='wallet'?'text-slate-900':'text-slate-400'}`}><Wallet size={24}/><span className="text-[10px]">กระเป๋า</span></button>
           <div className="relative -top-6"><button onClick={() => { setTxForm({ type: 'expense', amount: '', date: new Date().toISOString().split('T')[0], category: 'ทั่วไป', status: 'unpaid' }); setShowAddTx(true); }} className="bg-slate-900 text-white w-14 h-14 rounded-full shadow-xl flex items-center justify-center border-4 border-white"><Plus size={28}/></button></div>
           <button onClick={() => setActiveTab('transactions')} className={`flex flex-col items-center gap-1 ${activeTab==='transactions'?'text-slate-900':'text-slate-400'}`}><List size={24}/><span className="text-[10px]">รายการ</span></button>
           <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 ${activeTab==='settings'?'text-slate-900':'text-slate-400'}`}><Settings size={24}/><span className="text-[10px]">ตั้งค่า</span></button>
        </div>

        {/* Modals */}
        {showAddTx && (
          <div className="absolute inset-0 bg-black/60 z-50 flex items-end justify-center animate-fade-in">
             <div className="bg-white w-full h-[90%] rounded-t-3xl p-6 relative flex flex-col">
                <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-xl">{txForm.id ? 'แก้ไข' : 'เพิ่ม'}รายการ</h3><button onClick={() => setShowAddTx(false)} className="p-2 bg-slate-100 rounded-full"><X size={24}/></button></div>
                <div className="flex-1 overflow-y-auto space-y-6 pb-10">
                   <div className="flex bg-slate-100 p-1.5 rounded-2xl">{[{ id: 'expense', label: 'รายจ่าย' }, { id: 'income', label: 'รายรับ' }, { id: 'transfer', label: 'โอน/ชำระ' }].map((t) => (<button key={t.id} onClick={() => setTxForm({ ...txForm, type: t.id })} className={`flex-1 py-3 rounded-xl text-sm font-bold ${txForm.type === t.id ? 'bg-white shadow' : 'text-slate-400'}`}>{t.label}</button>))}</div>
                   <div className="text-center"><input type="number" inputMode="decimal" className="text-6xl font-black text-center w-full border-none focus:ring-0" placeholder="0" value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: e.target.value })} /></div>
                   <div className="bg-slate-50 p-5 rounded-3xl space-y-3">
                      <select className="w-full p-4 rounded-2xl border-2 font-bold" value={txForm.accountId || ''} onChange={e => setTxForm({ ...txForm, accountId: e.target.value })}><option value="">-- เลือกบัญชี --</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.bank} - {a.name}</option>)}</select>
                      {txForm.type === 'transfer' && <select className="w-full p-4 rounded-2xl border-2 font-bold text-blue-600" value={txForm.toAccountId || ''} onChange={e => setTxForm({ ...txForm, toAccountId: e.target.value })}><option value="">-- ปลายทาง --</option>{accounts.filter(a => a.id !== txForm.accountId).map(a => <option key={a.id} value={a.id}>{a.bank} - {a.name}</option>)}</select>}
                   </div>
                   <div className="space-y-3"><input type="text" placeholder="รายละเอียด" className="w-full p-4 rounded-2xl border" value={txForm.description || ''} onChange={e => setTxForm({ ...txForm, description: e.target.value })} /><div className="flex gap-3"><input type="date" className="flex-1 p-3 rounded-2xl border text-sm" value={txForm.date} onChange={e => setTxForm({ ...txForm, date: e.target.value })} /><select className="flex-1 p-3 rounded-2xl border text-sm" value={txForm.category} onChange={e => setTxForm({...txForm, category: e.target.value})}>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></div></div>
                   <button onClick={handleSaveTx} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-xl">บันทึก</button>
                   {txForm.id && <button onClick={handleDeleteTx} className="w-full py-4 text-rose-600 font-bold">ลบรายการ</button>}
                </div>
             </div>
          </div>
        )}

        {showCategoryMgr && (
           <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-3xl p-6 relative">
                 <button onClick={() => setShowCategoryMgr(false)} className="absolute top-4 right-4"><X/></button>
                 <h3 className="font-bold text-xl mb-4">จัดการหมวดหมู่</h3>
                 <div className="flex gap-2 mb-4"><input type="text" placeholder="ชื่อหมวดหมู่" className="flex-1 p-2 border rounded" value={newCategory} onChange={e => setNewCategory(e.target.value)}/><button onClick={handleAddCategory} className="bg-blue-600 text-white px-4 rounded font-bold">เพิ่ม</button></div>
                 <div className="max-h-60 overflow-y-auto space-y-2">{categories.map(c => (<div key={c} className="flex justify-between p-2 bg-slate-50 rounded"><span>{c}</span><button onClick={() => handleDeleteCategory(c)} className="text-rose-500"><Trash2 size={16}/></button></div>))}</div>
              </div>
           </div>
        )}

        {showImport && <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-6"><div className="bg-white w-full rounded-3xl p-6 relative"><button onClick={() => setShowImport(false)} className="absolute top-4 right-4"><X/></button><h3 className="font-bold text-xl mb-4">Import CSV</h3><input type="file" onChange={handleImport} className="w-full"/></div></div>}
        {importing && <div className="absolute inset-0 bg-white/80 z-50 flex items-center justify-center">Importing...</div>}

        {editingAccount && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl h-[80%] overflow-y-auto">
                <h3 className="font-bold text-xl mb-4">{isNewAccount ? 'เพิ่มบัญชี' : 'แก้ไขบัญชี'}</h3>
                <div className="space-y-3">
                   <input type="text" placeholder="ชื่อบัญชี" className="w-full p-3 border rounded-xl" value={editingAccount.name} onChange={e => setEditingAccount({...editingAccount, name: e.target.value})}/>
                   <input type="text" placeholder="ธนาคาร" className="w-full p-3 border rounded-xl" value={editingAccount.bank} onChange={e => setEditingAccount({...editingAccount, bank: e.target.value})}/>
                   <select className="w-full p-3 border rounded-xl bg-white" value={editingAccount.type} onChange={e => setEditingAccount({...editingAccount, type: e.target.value as any})}><option value="bank">ธนาคาร</option><option value="credit">บัตรเครดิต</option><option value="cash">เงินสด</option></select>
                   <input type="number" placeholder="ยอดเงิน/วงเงินคงเหลือ" className="w-full p-3 border rounded-xl font-bold text-lg" value={editingAccount.balance} onChange={e => setEditingAccount({...editingAccount, balance: Number(e.target.value)})}/>
                   {editingAccount.type === 'credit' && <input type="number" placeholder="วงเงินทั้งหมด" className="w-full p-3 border rounded-xl" value={editingAccount.limit} onChange={e => setEditingAccount({...editingAccount, limit: Number(e.target.value)})}/>}
                   <div className="flex gap-2 pt-2"><button onClick={() => setEditingAccount(null)} className="flex-1 py-3 bg-slate-100 rounded-xl">ยกเลิก</button><button onClick={handleSaveAccount} className="flex-1 py-3 bg-slate-900 text-white rounded-xl">บันทึก</button></div>
                   {!isNewAccount && <button onClick={handleDeleteAccount} className="w-full py-2 text-rose-500 text-xs">ลบบัญชี</button>}
                </div>
             </div>
          </div>
        )}
      </div>
      <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; } .animate-fade-in { animation: fade-in 0.2s ease-out; } @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  );
}