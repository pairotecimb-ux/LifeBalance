import React, { useState, useEffect, useMemo } from 'react';
import {
  PieChart as IconPieChart, CreditCard, Plus, Trash2, Wallet, LayoutDashboard, List, Settings, Upload, Download,
  CheckCircle2, XCircle, TrendingUp, DollarSign, ArrowRightLeft, Landmark, Coins, Edit2, UserCircle, LogOut, Lock, Repeat, Building, Search, X
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import {
  getFirestore, collection, addDoc, query, onSnapshot, deleteDoc, doc, updateDoc,
  serverTimestamp, writeBatch, orderBy, increment
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const APP_VERSION = "v11.0.0 (Resurrection)";
const appId = 'credit-manager-pro-v11';

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
const safeNumber = (val: any) => {
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
};

const formatCurrency = (val: any) => {
  try {
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(safeNumber(val));
  } catch (e) { return '0.00'; }
};

const formatDate = (date: any) => {
  if (!date) return '-';
  try {
    return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }).format(new Date(date));
  } catch (e) { return '-'; }
};

const getThaiMonthName = (dateStr: string) => {
  if (!dateStr) return 'ทั้งหมด';
  try {
    const date = new Date(dateStr + '-01');
    return isNaN(date.getTime()) ? dateStr : date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  } catch (e) { return dateStr; }
};

const parseThaiMonthToDate = (str: string) => {
  if (!str) return new Date().toISOString().split('T')[0];
  try {
    const parts = str.trim().split(/[-/]/); 
    if (parts.length < 2) return new Date().toISOString().split('T')[0];
    const mStr = parts[0];
    const yStr = parts[1];
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const monthIndex = months.findIndex(m => mStr.includes(m));
    let year = parseInt(yStr);
    if (year < 100) year += 2500; 
    year -= 543; 
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

const BANK_COLORS: Record<string, string> = {
  'ไทยพาณิชย์': 'from-purple-600 to-purple-900', 'SCB': 'from-purple-600 to-purple-900',
  'กสิกรไทย': 'from-emerald-500 to-emerald-800', 'Kbank': 'from-emerald-500 to-emerald-800', 'Kplus': 'from-emerald-500 to-emerald-800',
  'กรุงศรี': 'from-yellow-500 to-yellow-700', 'BAY': 'from-yellow-500 to-yellow-700', 'Krungsri': 'from-yellow-500 to-yellow-700',
  'กรุงเทพ': 'from-blue-600 to-blue-900', 'BBL': 'from-blue-600 to-blue-900', 'Bangkok': 'from-blue-600 to-blue-900',
  'ทหารไทย': 'from-blue-500 to-red-500', 'TTB': 'from-blue-500 to-red-500',
  'ยูโอบี': 'from-slate-600 to-slate-800', 'UOB': 'from-slate-600 to-slate-800',
  'ซิตี้': 'from-cyan-500 to-blue-700', 'Citi': 'from-cyan-500 to-blue-700',
  'ออมสิน': 'from-pink-400 to-pink-600', 'GSB': 'from-pink-400 to-pink-600',
  'เงินสด': 'from-green-500 to-green-700', 'Cash': 'from-green-500 to-green-700',
  'default': 'from-slate-500 to-slate-700'
};
const getBankColor = (bankName: string) => BANK_COLORS[Object.keys(BANK_COLORS).find(k => bankName?.toLowerCase().includes(k.toLowerCase())) || 'default'];

const CATEGORIES = ['ทั่วไป', 'อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'บิล/สาธารณูปโภค', 'ผ่อนสินค้า', 'สุขภาพ', 'บันเทิง', 'อื่นๆ'];

// --- Components ---

const LoginScreen = ({ onLogin, onGuest }: { onLogin: () => void, onGuest: () => void }) => (
  <div className="h-full flex flex-col items-center justify-center p-6 bg-slate-900 text-white text-center">
    <div className="w-full max-w-sm">
      <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl rotate-6"><Wallet className="w-10 h-10 text-white" /></div>
      <h1 className="text-3xl font-bold mb-2">Credit Manager V11</h1>
      <p className="text-slate-400 mb-8">จัดการการเงินครบวงจร</p>
      <div className="space-y-3">
        <button onClick={onLogin} className="w-full bg-white text-slate-900 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition">เข้าสู่ระบบด้วย Google</button>
        <button onClick={onGuest} className="w-full bg-white/10 text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-white/20 transition">ทดลองใช้งาน (Guest)</button>
      </div>
    </div>
  </div>
);

const AccountCard = ({ account, onClick }: { account: Account, onClick: () => void }) => (
  <div onClick={onClick} className={`relative p-5 rounded-2xl text-white overflow-hidden bg-gradient-to-br ${account.color} shadow-lg cursor-pointer hover:scale-[1.02] active:scale-95 transition-all duration-300 border border-white/10`}>
    <div className="flex justify-between items-start mb-4 relative z-10">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md">
          {account.type === 'bank' ? <Landmark size={20}/> : account.type === 'cash' ? <Coins size={20}/> : <CreditCard size={20}/>}
        </div>
        <div>
          <p className="text-[10px] opacity-80 uppercase font-bold tracking-wider flex items-center gap-1">{account.bank}</p>
          <p className="font-bold text-lg leading-none truncate w-40 drop-shadow-md">{account.name}</p>
          {account.accountNumber && <p className="text-[10px] opacity-70 font-mono mt-1 tracking-widest">{account.accountNumber}</p>}
        </div>
      </div>
      <Edit2 size={16} className="opacity-50" />
    </div>
    <div className="space-y-2 relative z-10">
      <div className="flex justify-between items-end">
        <p className="text-xs opacity-80 font-medium">{account.type === 'credit' ? 'วงเงินคงเหลือ' : 'ยอดเงินในบัญชี'}</p>
        <p className="text-2xl font-bold tracking-tight drop-shadow-sm">{formatCurrency(account.balance)}</p>
      </div>
      {account.type === 'credit' && safeNumber(account.limit) > 0 && (
        <>
          <div className="w-full bg-black/20 h-1.5 rounded-full overflow-hidden">
             <div className="bg-white h-full" style={{ width: `${Math.min(((safeNumber(account.limit) - safeNumber(account.balance)) / safeNumber(account.limit)) * 100, 100)}%` }}></div>
          </div>
          <div className="flex justify-between text-[10px] opacity-70 font-medium">
             <span>ใช้ไป: {formatCurrency(safeNumber(account.limit) - safeNumber(account.balance))}</span>
             <span>วงเงิน: {formatCurrency(account.limit || 0)}</span>
          </div>
        </>
      )}
      {safeNumber(account.totalDebt) > 0 && (
         <div className="mt-2 pt-2 border-t border-white/20 flex items-center gap-2">
           <div className="bg-rose-500/20 p-1 rounded-md"><TrendingUp size={12} className="text-rose-200 rotate-180"/></div>
           <p className="text-xs text-rose-100 font-bold">ภาระหนี้: {formatCurrency(account.totalDebt)}</p>
         </div>
      )}
    </div>
  </div>
);

// --- Main App ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'wallet' | 'transactions' | 'settings'>('dashboard');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recurringItems, setRecurringItems] = useState<RecurringItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  // UI States
  const [showAddTx, setShowAddTx] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showTxDetail, setShowTxDetail] = useState<Transaction | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isNewAccount, setIsNewAccount] = useState(false);

  // Filters & Form
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [walletFilterBank, setWalletFilterBank] = useState<string>('all'); 
  const [importing, setImporting] = useState(false);
  
  const [newTx, setNewTx] = useState<Partial<Transaction>>({ type: 'expense', amount: 0, date: new Date().toISOString().split('T')[0], category: 'ทั่วไป', status: 'unpaid' });
  const [newRecurring, setNewRecurring] = useState<Partial<RecurringItem>>({ day: 1, amount: 0 });

  useEffect(() => {
    return onAuthStateChanged(auth, u => { setUser(u); setAuthLoading(false); });
  }, []);

  const handleLogin = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e: any) { alert("Login failed: " + e.message); } };
  const handleGuestLogin = async () => { try { await signInAnonymously(auth); } catch (e: any) { alert(e.message); } };

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsubAcc = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'accounts'), s => setAccounts(s.docs.map(d => ({ id: d.id, ...d.data() } as Account))));
    const unsubTx = onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), orderBy('createdAt', 'desc')), s => {
      setTransactions(s.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
      if(!filterMonth && s.docs.length > 0) {
        const latest = s.docs[0].data().date.substring(0, 7);
        setFilterMonth(latest);
      }
      setLoading(false);
    });
    const unsubRec = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'recurring'), s => setRecurringItems(s.docs.map(d => ({ id: d.id, ...d.data() } as RecurringItem))));
    return () => { unsubAcc(); unsubTx(); unsubRec(); };
  }, [user]);

  // Logic
  const updateBalance = async (accId: string, amount: number) => {
    if(!accId) return;
    await updateDoc(doc(db, 'artifacts', appId, 'users', user!.uid, 'accounts', accId), { balance: increment(amount) });
  };

  const handleSaveTx = async () => {
    if (!user || !newTx.amount || !newTx.accountId) return alert('กรุณากรอกข้อมูล');
    const amount = Number(newTx.amount);
    
    // Revert Old
    if (newTx.id) {
      const old = transactions.find(t => t.id === newTx.id);
      if (old) {
        if (old.type === 'income') await updateBalance(old.accountId, -old.amount);
        else if (old.type === 'expense') await updateBalance(old.accountId, old.amount);
        else if (old.type === 'transfer' && old.toAccountId) { await updateBalance(old.accountId, old.amount); await updateBalance(old.toAccountId, -old.amount); }
      }
    }
    // Apply New
    if (newTx.type === 'income') await updateBalance(newTx.accountId!, amount);
    else if (newTx.type === 'expense') await updateBalance(newTx.accountId!, -amount);
    else if (newTx.type === 'transfer' && newTx.toAccountId) { await updateBalance(newTx.accountId!, -amount); await updateBalance(newTx.toAccountId, amount); }

    const payload = { ...newTx, amount, updatedAt: serverTimestamp() };
    if (newTx.id) await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', newTx.id), payload);
    else await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), { ...payload, createdAt: serverTimestamp() });
    
    setShowAddTx(false); setShowTxDetail(null);
  };

  const handleDeleteTx = async () => {
    if (!user || !newTx.id || !confirm('ยืนยันลบ?')) return;
    const old = transactions.find(t => t.id === newTx.id);
    if(old) {
        if (old.type === 'income') await updateBalance(old.accountId, -old.amount);
        else if (old.type === 'expense') await updateBalance(old.accountId, old.amount);
        else if (old.type === 'transfer' && old.toAccountId) { await updateBalance(old.accountId, old.amount); await updateBalance(old.toAccountId, -old.amount); }
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', old.id));
    }
    setShowTxDetail(null); setShowAddTx(false);
  };

  const handleSaveAccount = async () => {
    if (!user || !editingAccount?.name) return;
    const payload = { 
      ...editingAccount, 
      balance: safeNumber(editingAccount.balance), 
      limit: safeNumber(editingAccount.limit), 
      totalDebt: safeNumber(editingAccount.totalDebt), 
      color: getBankColor(editingAccount.bank) 
    };
    if (isNewAccount) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'accounts'), { ...payload, createdAt: serverTimestamp() });
    else await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'accounts', editingAccount.id), payload);
    setEditingAccount(null);
  };

  const handleDeleteAccount = async () => {
    if (!user || !editingAccount || isNewAccount) return;
    if (confirm('ยืนยันลบ?')) {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'accounts', editingAccount.id));
      setEditingAccount(null);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        let text = "";
        try { text = new TextDecoder('utf-8').decode(ev.target?.result as ArrayBuffer); } catch {}
        if (!text.includes('ประเภทบัญชี')) { try { text = new TextDecoder('windows-874').decode(ev.target?.result as ArrayBuffer); } catch {} }
        const lines = text.split(/\r\n|\n/).filter(l => l.trim());
        const headerIdx = lines.findIndex(l => l.includes('ประเภทบัญชี'));
        if (headerIdx === -1) throw new Error('ไม่พบหัวตาราง "ประเภทบัญชี"');
        const headers = lines[headerIdx].split(',').map(h => h.trim().replace(/"/g, ''));
        const getCol = (k: string) => headers.findIndex(h => h.includes(k));
        const batch = writeBatch(db);
        let count = 0;
        const existing = new Map(accounts.map(a => [`${a.bank}-${a.name}`, a.id]));
        const newCache = new Map();

        for (let i = headerIdx + 1; i < lines.length; i++) {
          const row = lines[i].split(',');
          if (row.length < 5) continue;
          const clean = (idx: number) => idx > -1 ? row[idx].replace(/"/g, '').trim() : '';
          const num = (idx: number) => parseFloat(clean(idx).replace(/,/g, '')) || 0;
          const name = clean(getCol('ชื่อบัตร')) || 'General';
          const bank = clean(getCol('ธนาคาร')) || 'Other';
          const typeRaw = clean(getCol('ประเภทบัญชี'));
          const balanceVal = num(getCol('ยอดเงินในบัญชี'));
          let type: AccountType = (typeRaw.includes('บัญชี') || bank.includes('ธนาคาร') || balanceVal > 0) ? 'bank' : typeRaw.includes('เงินสด') ? 'cash' : 'credit';
          const key = `${bank}-${name}`;
          
          let accId = existing.get(key) || newCache.get(key);
          if (name && name !== 'N/A') {
             const accData: any = { 
               name, bank, type, color: getBankColor(bank),
               accountNumber: fixScientificNotation(clean(getCol('เลขบัตร'))),
               cardType: clean(getCol('ประเภทบัตร')),
               statementDay: parseInt(clean(getCol('วันสรุปยอด'))) || 0,
               dueDay: parseInt(clean(getCol('กำหนดชำระ'))) || 0,
               totalDebt: num(getCol('ภาระหนี้'))
             };
             accData.limit = num(getCol('วงเงินทั้งหมด')) || 0;
             if (type === 'credit') { 
                const limitRem = num(getCol('วงเงินคงเหลือ'));
                const limitUsed = num(getCol('วงเงินที่ใช้ไป'));
                accData.balance = limitRem > 0 ? limitRem : (limitUsed === 0 ? accData.limit : (accData.limit - limitUsed));
             } else { accData.balance = balanceVal; }
             if (isNaN(accData.balance)) accData.balance = 0;
             if (accId) batch.update(doc(db, 'artifacts', appId, 'users', user.uid, 'accounts', accId), accData);
             else {
               const ref = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'accounts'));
               batch.set(ref, { ...accData, createdAt: serverTimestamp() });
               accId = ref.id; newCache.set(key, accId);
             }
             count++;
          }
          
          const desc = clean(getCol('รายละเอียดค่าใช้จ่าย'));
          const amt = num(getCol('ยอดชำระ'));
          if (accId && desc && desc !== 'ไม่มี' && amt > 0) {
             const txRef = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'));
             const monthStr = clean(getCol('ธุรกรรมเดือน') > -1 ? getCol('ธุรกรรมเดือน') : getCol('รายการเดือน'));
             batch.set(txRef, {
               accountId: accId, description: desc, amount: amt,
               date: monthStr ? parseThaiMonthToDate(monthStr) : new Date().toISOString().split('T')[0],
               status: clean(getCol('สถานะ')).includes('จ่ายแล้ว') ? 'paid' : 'unpaid',
               type: 'expense', category: 'Import', installment: clean(getCol('งวดผ่อน')), createdAt: serverTimestamp()
             });
             count++;
          }
        }
        await batch.commit();
        alert(`Imported ${count} items`);
        setShowImport(false);
      } catch (e: any) { alert(e.message); } finally { setImporting(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExportCSV = () => {
    if (transactions.length === 0) return alert('ไม่มีข้อมูล');
    let csv = "Date,Type,Description,Amount,Account,Bank,Status,Category\n";
    transactions.forEach(t => {
      const acc = accounts.find(a => a.id === t.accountId);
      csv += `${t.date},${t.type},"${t.description}",${t.amount},"${acc?.name}","${acc?.bank}",${t.status},${t.category}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleSaveRecurring = async () => {
    if (!user || !newRecurring.description) return;
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'recurring'), { ...newRecurring, amount: Number(newRecurring.amount) });
    setNewRecurring({ day: 1, amount: 0 });
    alert('บันทึกแล้ว');
  };

  const handleUseRecurring = async (item: RecurringItem) => {
    const today = new Date();
    const date = new Date(today.getFullYear(), today.getMonth(), item.day).toISOString().split('T')[0];
    await handleSaveTx({ ...item, date, type: 'expense', status: 'unpaid' });
    alert('สร้างรายการแล้ว');
  };

  const handleClearAll = async () => {
    if (!confirm('ล้างข้อมูลทั้งหมด?')) return;
    setLoading(true);
    const batch = writeBatch(db);
    accounts.forEach(a => batch.delete(doc(db, 'artifacts', appId, 'users', user!.uid, 'accounts', a.id)));
    transactions.forEach(t => batch.delete(doc(db, 'artifacts', appId, 'users', user!.uid, 'transactions', t.id)));
    await batch.commit();
    setLoading(false);
    alert('ล้างข้อมูลเรียบร้อย');
  };

  // Stats
  const availableMonths = useMemo(() => Array.from(new Set(transactions.map(t => t.date.substring(0, 7)))).sort().reverse(), [transactions]);
  const filteredTx = useMemo(() => transactions.filter(t => (!filterMonth || t.date.startsWith(filterMonth)) && (filterType === 'all' || t.type === filterType) && (filterStatus === 'all' || t.status === filterStatus)), [transactions, filterMonth, filterType, filterStatus]);
  
  const totalAssets = accounts.filter(a => a.type !== 'credit').reduce((s, a) => s + a.balance, 0);
  const totalDebt = accounts.reduce((s, a) => s + (a.totalDebt || 0), 0);
  const creditLimit = accounts.filter(a => a.type === 'credit').reduce((s, a) => s + (a.limit || 0), 0);
  const creditBal = accounts.filter(a => a.type === 'credit').reduce((s, a) => s + a.balance, 0);
  const creditUsedReal = creditLimit - creditBal;

  const chartData = useMemo(() => {
    const data: Record<string, number> = {};
    filteredTx.filter(t => t.type === 'expense').forEach(t => data[t.category] = (data[t.category] || 0) + t.amount);
    return Object.entries(data).sort((a,b)=>b[1]-a[1]).map(([name, value], i) => ({ name, value, color: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'][i%5] }));
  }, [filteredTx]);

  const bankSummary = useMemo(() => {
    const sum: Record<string, number> = {};
    filteredTx.filter(t => t.type === 'expense').forEach(t => {
       const bank = accounts.find(a => a.id === t.accountId)?.bank || 'Other';
       sum[bank] = (sum[bank] || 0) + t.amount;
    });
    return sum;
  }, [filteredTx, accounts]);

  if (loading || authLoading) return <div className="h-screen flex items-center justify-center text-slate-400">Loading...</div>;
  if (!user) return <LoginScreen onLogin={handleLogin} onGuest={handleGuestLogin} />;

  return (
    <div className="h-screen bg-slate-100 font-sans text-slate-900 flex flex-col items-center justify-center overflow-hidden">
      <div className="w-full max-w-md bg-white sm:my-8 sm:rounded-[2.5rem] sm:shadow-2xl sm:border-[8px] sm:border-slate-800 flex flex-col relative h-full sm:h-[850px]">
        {/* Header */}
        <div className="px-6 pt-12 pb-2 bg-white flex justify-between items-center shrink-0 z-20">
           <div><p className="text-[10px] text-slate-400 uppercase">My Wallet</p><p className="font-bold text-lg">Dashboard</p></div>
           <button onClick={() => setActiveTab('settings')} className="p-2 bg-slate-50 rounded-full hover:bg-slate-100 transition"><Settings size={20}/></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 hide-scrollbar bg-white relative z-10 pb-24">
           {activeTab === 'dashboard' && (
             <div className="space-y-6">
                <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl relative overflow-hidden">
                   <div className="relative z-10">
                      <div className="flex justify-between items-center mb-4">
                        <p className="text-xs text-slate-400">ความมั่งคั่งสุทธิ</p>
                        <select className="bg-white/10 text-xs p-1.5 rounded-lg text-white border-none outline-none" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
                            <option value="">ทั้งหมด</option>
                            {availableMonths.map(m => <option key={m} value={m}>{getThaiMonthName(m + '-01')}</option>)}
                        </select>
                      </div>
                      <h1 className="text-4xl font-bold">{formatCurrency(totalAssets - creditUsedReal - totalDebt)}</h1>
                      <div className="grid grid-cols-2 gap-4 mt-6">
                          <div className="bg-white/10 p-3 rounded-xl"><p className="text-[10px] text-emerald-300">สินทรัพย์</p><p className="text-lg font-bold">{formatCurrency(totalAssets)}</p></div>
                          <div className="bg-white/10 p-3 rounded-xl"><p className="text-[10px] text-rose-300">หนี้สินรวม</p><p className="text-lg font-bold">{formatCurrency(creditUsedReal + totalDebt)}</p></div>
                      </div>
                   </div>
                </div>

                <div className="bg-white border rounded-2xl p-4 shadow-sm">
                   <h3 className="font-bold text-sm mb-4">สัดส่วนค่าใช้จ่าย</h3>
                   <div className="flex items-center gap-6">
                      <div className="w-28 h-28 rounded-full flex-none" style={{background: `conic-gradient(${chartData.length ? chartData.map((d,i,arr) => { const prev = arr.slice(0,i).reduce((s,x)=>s+x.value,0); const total = arr.reduce((s,x)=>s+x.value,0); return `${d.color} ${(prev/total)*100}% ${((prev+d.value)/total)*100}%` }).join(',') : '#f1f5f9 0% 100%'})`}}></div>
                      <div className="flex-1 space-y-2">
                         {chartData.slice(0,4).map((d,i) => (
                           <div key={i} className="flex justify-between text-xs items-center">
                              <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{background:d.color}}></span>{d.name}</span>
                              <span className="font-medium">{formatCurrency(d.value)}</span>
                           </div>
                         ))}
                      </div>
                   </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                   <h3 className="font-bold mb-3 text-sm">สรุปตามธนาคาร</h3>
                   {Object.entries(bankSummary).map(([bank, amt]) => (<div key={bank} className="flex justify-between text-xs mb-2 border-b border-slate-200 pb-2 last:border-0 last:mb-0"><span>{bank}</span><span className="font-bold text-slate-700">{formatCurrency(amt)}</span></div>))}
                </div>
             </div>
           )}
           {activeTab === 'wallet' && (
             <div className="pt-4 space-y-6">
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                   <button onClick={() => setWalletFilterBank('all')} className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap ${walletFilterBank === 'all' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>ทั้งหมด</button>
                   {[...new Set(accounts.map(a => a.bank))].sort().map(bank => (
                      <button key={bank} onClick={() => setWalletFilterBank(bank)} className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap ${walletFilterBank === bank ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>{bank}</button>
                   ))}
                </div>
                <div className="space-y-6">
                   {[...new Set(accounts.filter(a => walletFilterBank === 'all' || a.bank === walletFilterBank).map(a => a.bank))].sort().map(bank => (
                     <div key={bank}>
                       <h3 className="text-sm font-bold text-slate-500 mb-3 ml-1">{bank}</h3>
                       <div className="space-y-3">{accounts.filter(a => a.bank === bank).map(a => <AccountCard key={a.id} account={a} onClick={() => { setIsNewAccount(false); setEditingAccount(a); }} />)}</div>
                     </div>
                   ))}
                </div>
             </div>
           )}
           {activeTab === 'transactions' && (
             <div className="pt-4">
                <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
                   <select className="bg-white border rounded-xl text-xs p-2.5 min-w-[100px]" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}><option value="">ทุกเดือน</option>{availableMonths.map(m => <option key={m} value={m}>{getThaiMonthName(m+'-01')}</option>)}</select>
                   <select className="bg-white border rounded-xl text-xs p-2.5" value={filterType} onChange={e => setFilterType(e.target.value)}><option value="all">ทุกประเภท</option><option value="expense">รายจ่าย</option><option value="income">รายรับ</option></select>
                   <select className="bg-white border rounded-xl text-xs p-2.5" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="all">ทุกสถานะ</option><option value="paid">จ่ายแล้ว</option><option value="unpaid">รอจ่าย</option></select>
                </div>
                <div className="space-y-3 mb-8">{filteredTx.map(tx => (
                  <div key={tx.id} onClick={() => { setNewTx(tx); setShowTxDetail(tx); }} className="bg-white p-4 border border-slate-100 rounded-2xl flex justify-between items-center">
                     <div className={`absolute left-0 top-0 bottom-0 w-1 ${tx.status === 'paid' ? 'bg-emerald-400' : 'bg-amber-400'}`}></div>
                     <div className="pl-3">
                       <p className="font-bold text-sm truncate w-40 text-slate-800">{tx.description}</p>
                       <p className="text-[10px] text-slate-400 mt-0.5">{formatDate(tx.date)} • {accounts.find(a=>a.id===tx.accountId)?.name}</p>
                     </div>
                     <div className="text-right">
                       <p className={`font-bold ${tx.type==='income'?'text-emerald-600':'text-slate-900'}`}>{tx.type==='expense'?'-':''}{formatCurrency(tx.amount)}</p>
                       <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${tx.status==='paid' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>{tx.status==='paid'?'จ่ายแล้ว':'รอจ่าย'}</span>
                     </div>
                  </div>
                ))}</div>
             </div>
           )}
           {activeTab === 'settings' && (
             <div className="pt-4">
                <h2 className="text-2xl font-bold mb-4">ตั้งค่า</h2>
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden mb-4 shadow-sm">
                   <div className="p-4 border-b border-slate-50 bg-slate-50/50"><h3 className="font-bold flex items-center gap-2 text-sm"><UserCircle size={16}/> ข้อมูลส่วนตัว</h3></div>
                   <div className="p-4 text-sm text-slate-600"><p>อีเมล: {user?.email || 'Guest Mode'}</p><p className="text-xs text-slate-400 mt-1">ID: {user?.uid?.slice(0,8)}...</p></div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden mb-4 shadow-sm">
                   <div className="p-4 border-b border-slate-50 bg-slate-50/50"><h3 className="font-bold flex items-center gap-2 text-sm"><Repeat size={16}/> รายจ่ายประจำ</h3></div>
                   <div className="p-4 space-y-3">
                      <div className="flex gap-2">
                         <input type="text" placeholder="รายการ" className="flex-[2] p-2.5 border rounded-xl text-xs" value={newRecurring.description || ''} onChange={e => setNewRecurring({...newRecurring, description: e.target.value})}/>
                         <input type="number" placeholder="บาท" className="w-16 p-2.5 border rounded-xl text-xs" onChange={e => setNewRecurring({...newRecurring, amount: Number(e.target.value)})}/>
                         <input type="number" placeholder="วันที่" className="w-12 p-2.5 border rounded-xl text-xs" onChange={e => setNewRecurring({...newRecurring, day: Number(e.target.value)})}/>
                      </div>
                      <button onClick={handleSaveRecurring} className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold">เพิ่ม Template</button>
                      <div className="mt-3 space-y-2">{recurringItems.map(r => (<div key={r.id} className="flex justify-between items-center text-xs bg-slate-50 p-3 rounded-xl border border-slate-100"><div><span className="font-bold">{r.description}</span></div><div className="flex items-center gap-2"><span>{formatCurrency(r.amount)}</span><button onClick={() => handleUseRecurring(r)} className="px-3 py-1 bg-blue-100 text-blue-600 rounded-lg">สร้าง</button><button onClick={() => deleteDoc(doc(db,'artifacts',appId,'users',user.uid,'recurring',r.id))} className="text-rose-400"><X size={14}/></button></div></div>))}</div>
                   </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                   <button onClick={() => setShowImport(true)} className="w-full p-4 border-b border-slate-50 flex items-center gap-3 text-left"><Upload size={18} className="text-blue-500"/> <span className="text-sm font-medium">นำเข้า CSV</span></button>
                   <button onClick={handleExportCSV} className="w-full p-4 border-b border-slate-50 flex items-center gap-3 text-left"><Download size={18} className="text-emerald-500"/> <span className="text-sm font-medium">ส่งออก CSV</span></button>
                   <button onClick={handleClearAll} className="w-full p-4 border-b border-slate-50 flex items-center gap-3 text-left text-rose-500"><Trash2 size={18}/> <span className="text-sm font-medium">ล้างข้อมูล</span></button>
                   <button onClick={() => signOut(auth)} className="w-full p-4 flex items-center gap-3 text-left text-rose-600"><LogOut size={18}/> <span className="text-sm font-bold">ออกจากระบบ</span></button>
                </div>
                <p className="text-center text-xs text-slate-300 mt-8">{APP_VERSION}</p>
             </div>
           )}
        </div>

        {/* Bottom Nav */}
        <div className="absolute bottom-0 w-full bg-white/95 backdrop-blur-xl border-t py-3 px-6 flex justify-between items-center z-30 pb-8 sm:pb-4 shadow-lg">
           <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 ${activeTab==='dashboard'?'text-slate-900':'text-slate-400'}`}><LayoutDashboard size={24}/><span className="text-[10px]">ภาพรวม</span></button>
           <button onClick={() => setActiveTab('wallet')} className={`flex flex-col items-center gap-1 ${activeTab==='wallet'?'text-slate-900':'text-slate-400'}`}><Wallet size={24}/><span className="text-[10px]">กระเป๋า</span></button>
           <div className="relative -top-6"><button onClick={() => { setNewTx({ type: 'expense', amount: 0, date: new Date().toISOString().split('T')[0], category: 'ทั่วไป', status: 'unpaid' }); setShowAddTx(true); }} className="bg-slate-900 text-white w-14 h-14 rounded-full shadow-xl flex items-center justify-center border-4 border-white"><Plus size={28}/></button></div>
           <button onClick={() => setActiveTab('transactions')} className={`flex flex-col items-center gap-1 ${activeTab==='transactions'?'text-slate-900':'text-slate-400'}`}><List size={24}/><span className="text-[10px]">รายการ</span></button>
           <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 ${activeTab==='settings'?'text-slate-900':'text-slate-400'}`}><Settings size={24}/><span className="text-[10px]">ตั้งค่า</span></button>
        </div>

        {/* Modals */}
        {importing && <div className="absolute inset-0 bg-white/90 z-50 flex flex-col items-center justify-center gap-4"><div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin"></div><p className="text-slate-600 font-bold animate-pulse">กำลังนำเข้าข้อมูล...</p></div>}
        
        {showImport && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
             <div className="bg-white w-full rounded-3xl p-6 shadow-2xl relative">
                <button onClick={() => setShowImport(false)} className="absolute top-4 right-4"><X/></button>
                <h3 className="font-bold text-xl mb-4 text-center">Import Data</h3>
                <input type="file" accept=".csv" onChange={handleImport} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700"/>
             </div>
          </div>
        )}
        
        {(showAddTx || showTxDetail) && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center">
             <div className="bg-white w-full h-[90%] rounded-t-3xl p-6 shadow-2xl relative flex flex-col">
                <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-xl">{showTxDetail ? 'แก้ไข' : 'เพิ่ม'}รายการ</h3><button onClick={() => { setShowAddTx(false); setShowTxDetail(null); }} className="p-2 bg-slate-100 rounded-full"><X size={24}/></button></div>
                <div className="flex-1 overflow-y-auto space-y-6">
                   <div className="flex bg-slate-100 p-1.5 rounded-2xl">{[{ id: 'expense', label: 'รายจ่าย' }, { id: 'income', label: 'รายรับ' }, { id: 'transfer', label: 'โอน/ชำระ' }].map((t) => (<button key={t.id} onClick={() => setNewTx({ ...newTx, type: t.id as any })} className={`flex-1 py-3 rounded-xl text-sm font-bold ${newTx.type === t.id ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}>{t.label}</button>))}</div>
                   <div className="text-center"><input type="number" inputMode="decimal" className="text-6xl font-black text-center w-full bg-transparent border-none outline-none" placeholder="0" value={newTx.amount || ''} onChange={e => setNewTx({ ...newTx, amount: parseFloat(e.target.value) })} /><p className="text-xs text-slate-400 mt-2 font-bold uppercase">THB</p></div>
                   <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 space-y-3">
                      <p className="text-xs font-bold text-slate-400 uppercase">{newTx.type === 'income' ? 'เข้าบัญชี' : 'จากบัญชี'}</p>
                      <select className="w-full p-4 rounded-2xl border-2 border-slate-200 text-sm font-bold bg-white" value={newTx.accountId || ''} onChange={e => setNewTx({ ...newTx, accountId: e.target.value })}><option value="">-- เลือกบัญชี --</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.type==='credit'?'💳':'🏦'} {a.bank} - {a.name} ({formatCurrency(a.balance)})</option>)}</select>
                   </div>
                   {newTx.type === 'transfer' && <div className="bg-blue-50 p-5 rounded-3xl border border-blue-100 space-y-3"><p className="text-xs font-bold text-blue-500 uppercase">ไปยัง</p><select className="w-full p-4 rounded-2xl border-2 border-blue-200 text-sm font-bold bg-white" value={newTx.toAccountId || ''} onChange={e => setNewTx({ ...newTx, toAccountId: e.target.value })}><option value="">-- เลือกปลายทาง --</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.type==='credit'?'💳':'🏦'} {a.bank} - {a.name}</option>)}</select></div>}
                   <div className="space-y-3"><input type="text" placeholder="รายละเอียด" className="w-full p-4 rounded-2xl border border-slate-200 outline-none" value={newTx.description || ''} onChange={e => setNewTx({ ...newTx, description: e.target.value })} /><div className="flex gap-3"><input type="date" className="flex-1 p-3 rounded-2xl border border-slate-200 text-sm bg-white" value={newTx.date} onChange={e => setNewTx({ ...newTx, date: e.target.value })} /><select className="flex-1 p-3 rounded-2xl border border-slate-200 text-sm bg-white" value={newTx.category} onChange={e => setNewTx({...newTx, category: e.target.value})}>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div></div>
                   <button onClick={handleSaveTx} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-xl">บันทึก</button>
                   {showTxDetail && <div className="flex gap-2 mt-4"><button onClick={() => handleToggleStatus(showTxDetail)} className={`flex-1 py-3 font-bold rounded-xl ${showTxDetail.status==='paid'?'bg-amber-100 text-amber-700':'bg-emerald-100 text-emerald-700'}`}>{showTxDetail.status==='paid'?'เปลี่ยนเป็นรอจ่าย':'ยืนยันการจ่าย'}</button><button onClick={handleDeleteTx} className="flex-1 py-3 text-rose-600 bg-rose-50 rounded-xl font-bold">ลบรายการ</button></div>}
                </div>
             </div>
          </div>
        )}

        {editingAccount && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
             <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl h-[80%] overflow-y-auto">
                <h3 className="font-bold text-xl mb-4">{isNewAccount ? 'เพิ่มบัญชี' : 'แก้ไขบัญชี'}</h3>
                <div className="space-y-4">
                   <input type="text" placeholder="ชื่อบัญชี" className="w-full p-3 border rounded-xl" value={editingAccount.name} onChange={e => setEditingAccount({...editingAccount, name: e.target.value})}/>
                   <input type="text" placeholder="ธนาคาร" className="w-full p-3 border rounded-xl" value={editingAccount.bank} onChange={e => setEditingAccount({...editingAccount, bank: e.target.value})}/>
                   <select className="w-full p-3 border rounded-xl bg-white" value={editingAccount.type} onChange={e => setEditingAccount({...editingAccount, type: e.target.value as any})}><option value="bank">ธนาคาร</option><option value="credit">บัตรเครดิต</option><option value="cash">เงินสด</option></select>
                   <input type="number" placeholder="ยอดเงิน/วงเงินคงเหลือ" className="w-full p-3 border rounded-xl font-bold" value={editingAccount.balance} onChange={e => setEditingAccount({...editingAccount, balance: Number(e.target.value)})}/>
                   {editingAccount.type === 'credit' && <><input type="number" placeholder="วงเงินทั้งหมด" className="w-full p-3 border rounded-xl" value={editingAccount.limit} onChange={e => setEditingAccount({...editingAccount, limit: Number(e.target.value)})}/><div className="flex gap-3"><input type="number" placeholder="วันตัดรอบ" className="flex-1 p-3 border rounded-xl" value={editingAccount.statementDay || ''} onChange={e => setEditingAccount({...editingAccount, statementDay: Number(e.target.value)})}/><input type="number" placeholder="วันจ่าย" className="flex-1 p-3 border rounded-xl" value={editingAccount.dueDay || ''} onChange={e => setEditingAccount({...editingAccount, dueDay: Number(e.target.value)})}/></div></>}
                   <div className="flex gap-2 pt-4"><button onClick={() => setEditingAccount(null)} className="flex-1 py-3 bg-slate-100 rounded-xl">ยกเลิก</button><button onClick={handleSaveAccount} className="flex-1 py-3 bg-slate-900 text-white rounded-xl">บันทึก</button></div>
                   {!isNewAccount && <button onClick={handleDeleteAccount} className="w-full py-3 text-rose-500 font-bold">ลบบัญชี</button>}
                </div>
             </div>
          </div>
        )}
      </div>
      <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
    </div>
  );
}