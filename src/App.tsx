import React, { useState, useEffect, useMemo } from 'react';
import {
  PieChart, CreditCard, Plus, Trash2, Wallet, LayoutDashboard, List, Settings, Upload,
  CheckCircle2, XCircle, TrendingUp, DollarSign, Calendar, ChevronRight, Filter,
  ArrowRightLeft, Landmark, Coins, Edit2, Save, Building, MoreHorizontal, Search, X, LogOut, Lock, Info, Repeat, RefreshCw
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
const APP_VERSION = "v6.3.0 (Logic Fix)";
const appId = 'credit-manager-pro-v6-final';

// --- Types ---
type AccountType = 'credit' | 'bank' | 'cash';

interface Account {
  id: string;
  name: string;
  bank: string;
  type: AccountType;
  accountNumber?: string;
  cardType?: string;     
  limit?: number;        // Total Limit
  balance: number;       // Cash Balance OR Remaining Limit
  usedLimit?: number;    // For Credit: Amount used (Imported)
  totalDebt?: number;    // External Debt Burden
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
const formatCurrency = (val: number) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(val);
const formatDate = (date: string) => date ? new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }).format(new Date(date)) : '-';
const getThaiMonthName = (dateStr: string) => {
  if (!dateStr) return 'ทั้งหมด';
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? dateStr : date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
};

const parseThaiMonthToDate = (str: string) => {
  if (!str) return new Date().toISOString().split('T')[0];
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
  return new Date().toISOString().split('T')[0];
};

const fixScientificNotation = (str: string) => {
  if (!str) return '';
  if (str.toUpperCase().includes('E') || str.includes('+')) {
    const num = Number(str);
    if (!isNaN(num)) return num.toLocaleString('fullwide', { useGrouping: false });
  }
  return str;
};

const BANK_COLORS: Record<string, string> = {
  'ไทยพาณิชย์': 'from-purple-700 to-purple-900', 'SCB': 'from-purple-700 to-purple-900',
  'กสิกรไทย': 'from-emerald-600 to-emerald-800', 'Kbank': 'from-emerald-600 to-emerald-800', 'Kplus': 'from-emerald-600 to-emerald-800',
  'กรุงศรี': 'from-yellow-600 to-yellow-800', 'BAY': 'from-yellow-600 to-yellow-800',
  'กรุงเทพ': 'from-blue-700 to-blue-900', 'BBL': 'from-blue-700 to-blue-900', 'Bangkok': 'from-blue-700 to-blue-900',
  'ทหารไทย': 'from-blue-500 to-red-500', 'TTB': 'from-blue-500 to-red-500',
  'ยูโอบี': 'from-slate-700 to-slate-900', 'UOB': 'from-slate-700 to-slate-900',
  'ซิตี้': 'from-cyan-600 to-blue-800', 'Citi': 'from-cyan-600 to-blue-800',
  'ออมสิน': 'from-pink-500 to-pink-700', 'GSB': 'from-pink-500 to-pink-700',
  'เงินสด': 'from-green-600 to-green-800', 'Cash': 'from-green-600 to-green-800',
  'default': 'from-slate-600 to-slate-800'
};
const getBankColor = (bankName: string) => BANK_COLORS[Object.keys(BANK_COLORS).find(k => bankName?.toLowerCase().includes(k.toLowerCase())) || 'default'];

// --- Components ---

const LoginScreen = ({ onLogin }: { onLogin: () => void }) => (
  <div className="h-full flex flex-col items-center justify-center p-6 bg-slate-900 text-white text-center relative overflow-hidden">
    <div className="relative z-10 w-full max-w-sm">
      <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl rotate-6"><Wallet className="w-10 h-10 text-white" /></div>
      <h1 className="text-3xl font-bold mb-2">Credit Manager</h1>
      <p className="text-slate-400 mb-8 text-sm">จัดการทุกบัญชีในที่เดียว</p>
      <button onClick={onLogin} className="w-full bg-white text-slate-900 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition active:scale-95 shadow-lg">เข้าสู่ระบบด้วย Google</button>
    </div>
  </div>
);

const AccountCard = ({ account, onClick }: { account: Account, onClick: () => void }) => (
  <div onClick={onClick} className={`relative p-4 rounded-2xl text-white overflow-hidden bg-gradient-to-br ${account.color} shadow-lg cursor-pointer hover:scale-[1.02] transition-transform border border-white/10`}>
    <div className="flex justify-between items-start mb-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
          {account.type === 'bank' ? <Landmark size={14}/> : account.type === 'cash' ? <Coins size={14}/> : <CreditCard size={14}/>}
        </div>
        <div>
          <p className="text-[10px] opacity-80 uppercase font-medium flex items-center gap-1">{account.bank} {account.cardType && <span className="bg-white/20 px-1 rounded">{account.cardType}</span>}</p>
          <p className="font-bold text-lg leading-none truncate w-40">{account.name}</p>
          {account.accountNumber && <p className="text-[10px] opacity-60 font-mono mt-0.5">{account.accountNumber}</p>}
        </div>
      </div>
      <Edit2 size={16} className="opacity-50" />
    </div>
    
    <div className="space-y-1">
      <div className="flex justify-between items-end">
        <p className="text-xs opacity-70">{account.type === 'credit' ? 'วงเงินคงเหลือ' : 'ยอดเงินในบัญชี'}</p>
        <p className="text-xl font-bold">{formatCurrency(account.balance)}</p>
      </div>
      {account.type === 'credit' && account.limit && account.limit > 0 && (
        <>
          <div className="w-full bg-black/20 h-1.5 rounded-full overflow-hidden mt-1">
             <div className="bg-white h-full" style={{ width: `${Math.min(((account.limit - account.balance) / account.limit) * 100, 100)}%` }}></div>
          </div>
          <div className="flex justify-between text-[10px] opacity-60 pt-1">
             <span>ใช้ไป: {formatCurrency(account.limit - account.balance)}</span>
             <span>วงเงิน: {formatCurrency(account.limit)}</span>
          </div>
          {(account.statementDay || account.dueDay) && (
             <div className="flex gap-2 text-[9px] opacity-50 mt-1">
                {account.statementDay && <span>ตัดรอบ: {account.statementDay}</span>}
                {account.dueDay && <span>จ่าย: {account.dueDay}</span>}
             </div>
          )}
        </>
      )}
      {account.totalDebt !== undefined && account.totalDebt > 0 && (
         <div className="mt-2 pt-2 border-t border-white/10">
           <p className="text-[10px] text-rose-200 flex items-center gap-1"><TrendingUp size={10} className="rotate-180"/> ภาระหนี้: {formatCurrency(account.totalDebt)}</p>
         </div>
      )}
    </div>
  </div>
);

const AddTxForm = ({ accounts, initialData, onSave, onCancel, isEdit }: { accounts: Account[], initialData: Partial<Transaction>, onSave: (data: Partial<Transaction>) => void, onCancel: () => void, isEdit: boolean }) => {
  const [formData, setFormData] = useState(initialData);
  const [selectedBank, setSelectedBank] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');

  const banks = useMemo(() => Array.from(new Set(accounts.map(a => a.bank))).sort(), [accounts]);
  const filteredAccounts = useMemo(() => accounts.filter(a => (!selectedBank || a.bank === selectedBank) && (!selectedType || a.type === selectedType)), [accounts, selectedBank, selectedType]);

  const handleSubmit = () => {
    if(!formData.amount || !formData.accountId) return alert('กรุณากรอกข้อมูลให้ครบ');
    onSave(formData);
  };

  return (
    <div className="space-y-5 pb-10">
      <div className="flex bg-slate-100 p-1 rounded-xl">
        {[{ id: 'expense', label: 'รายจ่าย', color: 'text-rose-600' }, { id: 'income', label: 'รายรับ', color: 'text-emerald-600' }, { id: 'transfer', label: 'โอน/ชำระ', color: 'text-blue-600' }].map((t) => (
          <button key={t.id} onClick={() => setFormData({ ...formData, type: t.id as any })} className={`flex-1 py-3 rounded-lg text-sm font-bold transition ${formData.type === t.id ? `bg-white shadow ${t.color}` : 'text-slate-400'}`}>{t.label}</button>
        ))}
      </div>
      <div className="text-center relative">
        <input type="number" className="text-5xl font-bold text-center w-full bg-transparent border-none focus:ring-0 placeholder:text-slate-200 text-slate-800 p-0" placeholder="0" value={formData.amount || ''} onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) })} autoFocus={!isEdit} />
        <p className="text-xs text-slate-400 mt-2">บาท</p>
      </div>
      <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
         <p className="text-xs font-bold text-slate-400 uppercase">{formData.type === 'income' ? 'เข้าบัญชี' : formData.type === 'transfer' ? 'จากบัญชี (ต้นทาง)' : 'จ่ายด้วย'}</p>
         <div className="grid grid-cols-2 gap-2">
           <select className="p-3 rounded-xl border border-slate-200 text-sm outline-none bg-white" value={selectedBank} onChange={e => { setSelectedBank(e.target.value); setSelectedType(''); }}><option value="">ทุกธนาคาร</option>{banks.map(b => <option key={b} value={b}>{b}</option>)}</select>
           <select className="p-3 rounded-xl border border-slate-200 text-sm outline-none bg-white" value={selectedType} onChange={e => setSelectedType(e.target.value)}><option value="">ทุกประเภท</option><option value="bank">บัญชี</option><option value="credit">บัตรเครดิต</option><option value="cash">เงินสด</option></select>
         </div>
         <select className="w-full p-3 rounded-xl border border-slate-200 text-sm font-semibold bg-white outline-none focus:ring-2 focus:ring-slate-900" value={formData.accountId || ''} onChange={e => setFormData({ ...formData, accountId: e.target.value })}>
           <option value="">-- เลือกบัญชี --</option>
           {filteredAccounts.map(a => <option key={a.id} value={a.id}>{a.bank} - {a.name} ({formatCurrency(a.balance)})</option>)}
         </select>
      </div>
      {formData.type === 'transfer' && (
        <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 space-y-2">
           <p className="text-xs font-bold text-blue-400 uppercase flex items-center gap-1"><ArrowRightLeft size={12}/> ไปยัง / ชำระบัตร</p>
           <select className="w-full p-3 rounded-xl border border-blue-200 text-sm font-semibold bg-white outline-none focus:ring-2 focus:ring-blue-500" value={formData.toAccountId || ''} onChange={e => setFormData({ ...formData, toAccountId: e.target.value })}>
             <option value="">-- เลือกปลายทาง --</option>
             {accounts.filter(a => a.id !== formData.accountId).map(a => <option key={a.id} value={a.id}>{a.type === 'credit' ? '💳' : '🏦'} {a.bank} - {a.name}</option>)}
           </select>
        </div>
      )}
      <div className="space-y-3">
         <input type="text" placeholder="รายละเอียด (เช่น ค่ากาแฟ)" className="w-full p-4 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-slate-900" value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} />
         <div className="flex gap-3">
           <input type="date" className="flex-1 p-3 rounded-xl border border-slate-200 text-sm text-center bg-white" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
           {formData.type === 'expense' && <select className={`flex-1 p-3 rounded-xl border border-slate-200 text-sm text-center font-bold ${formData.status === 'paid' ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'}`} value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as any })}><option value="paid">จ่ายแล้ว</option><option value="unpaid">รอจ่าย</option></select>}
         </div>
      </div>
      <div className="pt-4 flex gap-3">
         <button onClick={onCancel} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-xl font-bold">ยกเลิก</button>
         <button onClick={handleSubmit} className="flex-[2] py-4 bg-slate-900 text-white rounded-xl font-bold shadow-lg active:scale-95 transition">{isEdit ? 'บันทึกการแก้ไข' : 'บันทึกรายการ'}</button>
      </div>
    </div>
  );
};

// --- Main Application ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
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

  // Filters
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [importing, setImporting] = useState(false);

  // Default New Tx
  const defaultTx: Partial<Transaction> = { type: 'expense', amount: 0, date: new Date().toISOString().split('T')[0], category: 'ทั่วไป', status: 'unpaid' };
  const [newTxData, setNewTxData] = useState<Partial<Transaction>>(defaultTx);
  const [newRecurring, setNewRecurring] = useState<Partial<RecurringItem>>({ day: 1, amount: 0 });

  useEffect(() => {
    return onAuthStateChanged(auth, u => { setUser(u); });
  }, []);

  const handleLogin = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e: any) { alert("Login failed: " + e.message); }
  };

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsubAcc = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'accounts'), s => setAccounts(s.docs.map(d => ({ id: d.id, ...d.data() } as Account))));
    const unsubTx = onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), orderBy('createdAt', 'desc')), s => {
      setTransactions(s.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
      setLoading(false);
    });
    const unsubRec = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'recurring'), s => setRecurringItems(s.docs.map(d => ({ id: d.id, ...d.data() } as RecurringItem))));
    return () => { unsubAcc(); unsubTx(); unsubRec(); };
  }, [user]);

  // Balance Update Logic
  const updateBalance = async (accId: string, amount: number) => {
    if(!accId) return;
    await updateDoc(doc(db, 'artifacts', appId, 'users', user!.uid, 'accounts', accId), { balance: increment(amount) });
  };

  const handleSaveTx = async (data: Partial<Transaction>) => {
    if (!user) return;
    const amount = Number(data.amount);
    const isEdit = !!data.id;
    
    // 1. Revert Old if Edit
    if (isEdit) {
      const old = transactions.find(t => t.id === data.id);
      if (old) {
        if (old.type === 'income') await updateBalance(old.accountId, -old.amount);
        else if (old.type === 'expense') await updateBalance(old.accountId, old.amount);
        else if (old.type === 'transfer' && old.toAccountId) { await updateBalance(old.accountId, old.amount); await updateBalance(old.toAccountId, -old.amount); }
      }
    }
    // 2. Apply New
    if (data.type === 'income') await updateBalance(data.accountId!, amount);
    else if (data.type === 'expense') await updateBalance(data.accountId!, -amount);
    else if (data.type === 'transfer' && data.toAccountId) { await updateBalance(data.accountId!, -amount); await updateBalance(data.toAccountId, amount); }

    const payload = { ...data, amount, updatedAt: serverTimestamp() };
    if (isEdit && data.id) await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', data.id), payload);
    else await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), { ...payload, createdAt: serverTimestamp() });
    
    setShowAddTx(false); setShowTxDetail(null);
  };

  const handleToggleStatus = async (tx: Transaction) => {
     if (!user) return;
     const newStatus = tx.status === 'paid' ? 'unpaid' : 'paid';
     const acc = accounts.find(a => a.id === tx.accountId);
     if (acc?.type === 'credit' && tx.type === 'expense') {
        if (newStatus === 'paid') await updateBalance(tx.accountId, tx.amount); // Give back limit
        else await updateBalance(tx.accountId, -tx.amount); // Take limit again
     }
     await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', tx.id), { status: newStatus });
  };

  const handleDeleteTx = async () => {
    if (!user || !showTxDetail) return;
    if (!confirm('ยืนยันลบ? ยอดเงินจะถูกคืนกลับ')) return;
    const old = showTxDetail;
    if (old.type === 'income') await updateBalance(old.accountId, -old.amount);
    else if (old.type === 'expense') await updateBalance(old.accountId, old.amount);
    else if (old.type === 'transfer' && old.toAccountId) { await updateBalance(old.accountId, old.amount); await updateBalance(old.toAccountId, -old.amount); }
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', old.id));
    setShowTxDetail(null);
  };

  const handleSaveAccount = async () => {
    if (!user || !editingAccount?.name) return;
    const payload = { ...editingAccount, balance: Number(editingAccount.balance), limit: Number(editingAccount.limit || 0), totalDebt: Number(editingAccount.totalDebt || 0), color: getBankColor(editingAccount.bank) };
    if (isNewAccount) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'accounts'), { ...payload, createdAt: serverTimestamp() });
    else await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'accounts', editingAccount.id), payload);
    setEditingAccount(null);
  };

  const handleDeleteAccount = async () => {
    if (!user || !editingAccount || isNewAccount) return;
    if (confirm('ยืนยันลบบัญชี?')) {
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
          // Fix logic: If balance > 0, treat as Bank
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
             
             // Fix Double Debt Logic: Recalculate Balance from Limit - Used
             const limitTotal = num(getCol('วงเงินทั้งหมด'));
             const limitUsed = num(getCol('วงเงินที่ใช้ไป'));

             if (type === 'credit') { 
                accData.limit = limitTotal; 
                // ถ้าใน CSV บอกว่าใช้ไป 0 ให้ถือว่าวงเงินคงเหลือ = วงเงินทั้งหมด
                accData.balance = limitUsed > 0 ? (limitTotal - limitUsed) : limitTotal; 
             } else {
                accData.balance = balanceVal;
             }
             
             if (accId) batch.update(doc(db, 'artifacts', appId, 'users', user.uid, 'accounts', accId), accData);
             else {
               const ref = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'accounts'));
               batch.set(ref, { ...accData, balance: accData.balance||0, limit: accData.limit||0, totalDebt: accData.totalDebt||0, createdAt: serverTimestamp() });
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

  const handleSaveRecurring = async () => {
    if (!user || !newRecurring.description) return;
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'recurring'), { ...newRecurring, amount: Number(newRecurring.amount) });
    setNewRecurring({ day: 1, amount: 0 });
    alert('บันทึกรายจ่ายประจำแล้ว');
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

  // Views
  const availableMonths = useMemo(() => Array.from(new Set(transactions.map(t => t.date.substring(0, 7)))).sort().reverse(), [transactions]);
  const filteredTx = useMemo(() => transactions.filter(t => (!filterMonth || t.date.startsWith(filterMonth)) && (filterType === 'all' || t.type === filterType) && (filterStatus === 'all' || t.status === filterStatus)), [transactions, filterMonth, filterType, filterStatus]);
  
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

  if (loading) return <div className="h-screen flex items-center justify-center text-slate-400">Loading...</div>;
  if (!user) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="h-screen bg-slate-100 font-sans text-slate-900 flex flex-col items-center justify-center overflow-hidden">
      <div className="w-full max-w-md bg-white sm:my-8 sm:rounded-[2.5rem] sm:shadow-2xl sm:border-[8px] sm:border-slate-800 flex flex-col relative h-full sm:h-[850px]">
        {/* Header */}
        <div className="px-6 pt-12 pb-2 bg-white flex justify-between items-center shrink-0 z-20">
           <div><p className="text-[10px] text-slate-400 uppercase">My Wallet</p><p className="font-bold text-lg">Dashboard</p></div>
           <button onClick={() => setActiveTab('settings')} className="p-2 bg-slate-50 rounded-full"><Settings size={20}/></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 hide-scrollbar bg-white relative z-10 pb-24">
           {activeTab === 'dashboard' && (
             <div className="space-y-6">
                <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl">
                   <div className="flex justify-between items-center mb-4">
                     <p className="text-xs text-slate-400">ภาพรวม {filterMonth ? getThaiMonthName(filterMonth + '-01') : '(ทั้งหมด)'}</p>
                     <select className="bg-white/10 text-xs p-1 rounded text-white border-none" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
                        <option value="">ทั้งหมด</option>
                        {availableMonths.map(m => <option key={m} value={m}>{getThaiMonthName(m + '-01')}</option>)}
                     </select>
                   </div>
                   <h1 className="text-4xl font-bold">{formatCurrency(totalAssets - (creditLimit - creditBal) - totalDebt)}</h1>
                   <div className="grid grid-cols-2 gap-4 mt-6">
                      <div className="bg-white/10 p-3 rounded-xl"><p className="text-[10px] text-emerald-300">สินทรัพย์ (เงินสด)</p><p className="text-lg font-bold">{formatCurrency(totalAssets)}</p></div>
                      <div className="bg-white/10 p-3 rounded-xl"><p className="text-[10px] text-rose-300">หนี้สินรวม (บัตร+ภาระ)</p><p className="text-lg font-bold">{formatCurrency((creditLimit - creditBal) + totalDebt)}</p></div>
                   </div>
                </div>
                {/* Recurring Quick Actions */}
                {recurringItems.length > 0 && (
                  <div>
                    <h3 className="font-bold mb-2 flex items-center gap-2"><Repeat size={16}/> บิลประจำเดือนนี้</h3>
                    <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
                       {recurringItems.map(item => (
                         <div key={item.id} onClick={() => handleUseRecurring(item)} className="min-w-[120px] p-3 bg-blue-50 border border-blue-100 rounded-xl cursor-pointer active:scale-95 transition">
                            <p className="text-xs font-bold text-blue-800 truncate">{item.description}</p>
                            <p className="text-[10px] text-blue-500">ทุกวันที่ {item.day}</p>
                            <p className="font-bold text-blue-600">{formatCurrency(item.amount)}</p>
                         </div>
                       ))}
                    </div>
                  </div>
                )}
             </div>
           )}
           {activeTab === 'wallet' && (
             <div className="pt-4 space-y-6">
                <div className="flex justify-between items-center"><h2 className="text-2xl font-bold">กระเป๋าตังค์</h2><button onClick={() => { setIsNewAccount(true); setEditingAccount({ id: '', name: '', bank: '', type: 'bank', balance: 0, color: 'from-slate-700 to-slate-900' }); }} className="bg-slate-900 text-white p-2 rounded-full shadow"><Plus size={20}/></button></div>
                {[...new Set(accounts.map(a => a.bank))].sort().map(bank => (
                  <div key={bank}>
                    <h3 className="text-sm font-bold text-slate-500 mb-2 sticky top-0 bg-white py-1">{bank}</h3>
                    <div className="space-y-3">{accounts.filter(a => a.bank === bank).map(a => <AccountCard key={a.id} account={a} onClick={() => { setIsNewAccount(false); setEditingAccount(a); }} />)}</div>
                  </div>
                ))}
             </div>
           )}
           {activeTab === 'transactions' && (
             <div className="pt-4">
                <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                   <select className="bg-white border rounded text-xs p-2 min-w-[100px]" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}><option value="">ทุกเดือน</option>{availableMonths.map(m => <option key={m} value={m}>{getThaiMonthName(m+'-01')}</option>)}</select>
                   <select className="bg-white border rounded text-xs p-2" value={filterType} onChange={e => setFilterType(e.target.value)}><option value="all">ทุกประเภท</option><option value="expense">รายจ่าย</option><option value="income">รายรับ</option></select>
                   <select className="bg-white border rounded text-xs p-2" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="all">ทุกสถานะ</option><option value="paid">จ่ายแล้ว</option><option value="unpaid">รอจ่าย</option></select>
                </div>
                <div className="space-y-2 mb-8">{filteredTx.map(tx => (
                  <div key={tx.id} onClick={() => { setNewTxData(tx); setShowTxDetail(tx); }} className="bg-white p-4 border rounded-xl flex justify-between items-center cursor-pointer relative overflow-hidden">
                     <div className={`absolute left-0 top-0 bottom-0 w-1 ${tx.status === 'paid' ? 'bg-emerald-400' : 'bg-amber-400'}`}></div>
                     <div className="pl-3">
                       <p className="font-bold text-sm truncate w-40">{tx.description}</p>
                       <p className="text-[10px] text-slate-400">{formatDate(tx.date)} • {accounts.find(a=>a.id===tx.accountId)?.name}</p>
                     </div>
                     <div className="text-right">
                       <p className={`font-bold ${tx.type==='income'?'text-emerald-600':'text-slate-900'}`}>{tx.type==='expense'?'-':''}{formatCurrency(tx.amount)}</p>
                       <span className={`text-[9px] px-1.5 py-0.5 rounded ${tx.status==='paid' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>{tx.status==='paid'?'จ่ายแล้ว':'รอจ่าย'}</span>
                     </div>
                  </div>
                ))}</div>
                <div className="bg-slate-50 p-4 rounded-xl">
                   <h3 className="font-bold mb-3 text-sm">สรุปยอดจ่ายตามธนาคาร ({filterMonth || 'ทั้งหมด'})</h3>
                   {Object.entries(bankSummary).map(([bank, amt]) => (
                     <div key={bank} className="flex justify-between text-xs mb-1 border-b border-slate-200 pb-1 last:border-0">
                        <span>{bank}</span>
                        <span className="font-bold">{formatCurrency(amt)}</span>
                     </div>
                   ))}
                </div>
             </div>
           )}
           {activeTab === 'settings' && (
             <div className="pt-4">
                <h2 className="text-2xl font-bold mb-4">ตั้งค่า</h2>
                <div className="space-y-2">
                   <div className="p-4 bg-white border rounded-xl">
                      <h3 className="font-bold mb-2 flex items-center gap-2"><Repeat size={16}/> ตั้งค่ารายจ่ายประจำ</h3>
                      <div className="flex gap-2 mb-2">
                         <input type="text" placeholder="ชื่อรายการ" className="flex-[2] p-2 border rounded text-xs" value={newRecurring.description || ''} onChange={e => setNewRecurring({...newRecurring, description: e.target.value})}/>
                         <input type="number" placeholder="บาท" className="flex-1 p-2 border rounded text-xs" onChange={e => setNewRecurring({...newRecurring, amount: Number(e.target.value)})}/>
                         <input type="number" placeholder="วันที่" className="w-12 p-2 border rounded text-xs" onChange={e => setNewRecurring({...newRecurring, day: Number(e.target.value)})}/>
                      </div>
                      <button onClick={handleSaveRecurring} className="w-full py-2 bg-slate-900 text-white rounded text-xs">เพิ่ม Template</button>
                      <div className="mt-3 space-y-1">
                         {recurringItems.map(r => (
                           <div key={r.id} className="flex justify-between text-xs text-slate-500 bg-slate-50 p-2 rounded">
                              <span>{r.description} (วันที่ {r.day})</span>
                              <span>{formatCurrency(r.amount)} <button onClick={() => deleteDoc(doc(db,'artifacts',appId,'users',user.uid,'recurring',r.id))} className="text-rose-500 ml-2">x</button></span>
                           </div>
                         ))}
                      </div>
                   </div>
                   <button onClick={() => setShowImport(true)} className="w-full p-4 bg-white border rounded-xl flex items-center gap-3"><Upload size={20}/> นำเข้า CSV</button>
                   <button onClick={handleClearAll} className="w-full p-4 bg-rose-50 text-rose-600 rounded-xl flex items-center gap-3"><Trash2 size={20}/> ล้างข้อมูลทั้งหมด</button>
                   <button onClick={() => signOut(auth)} className="w-full p-4 bg-slate-100 rounded-xl flex items-center gap-3"><LogOut size={20}/> ออกจากระบบ</button>
                </div>
                <p className="text-center text-xs text-slate-300 mt-8">{APP_VERSION}</p>
             </div>
           )}
        </div>

        {/* Bottom Nav (Fixed) */}
        <div className="absolute bottom-0 w-full bg-white/95 backdrop-blur-md border-t py-3 px-6 flex justify-between items-center z-30 pb-6 sm:pb-3 shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
           <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 transition ${activeTab==='dashboard'?'text-slate-900':'text-slate-400'}`}><LayoutDashboard size={24}/><span className="text-[10px]">ภาพรวม</span></button>
           <button onClick={() => setActiveTab('wallet')} className={`flex flex-col items-center gap-1 transition ${activeTab==='wallet'?'text-slate-900':'text-slate-400'}`}><Wallet size={24}/><span className="text-[10px]">กระเป๋า</span></button>
           <div className="relative -top-6"><button onClick={() => { setNewTxData(defaultTx); setShowAddTx(true); }} className="bg-slate-900 text-white w-14 h-14 rounded-full shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition border-4 border-white"><Plus size={28}/></button></div>
           <button onClick={() => setActiveTab('transactions')} className={`flex flex-col items-center gap-1 transition ${activeTab==='transactions'?'text-slate-900':'text-slate-400'}`}><List size={24}/><span className="text-[10px]">รายการ</span></button>
           <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 transition ${activeTab==='settings'?'text-slate-900':'text-slate-400'}`}><Settings size={24}/><span className="text-[10px]">ตั้งค่า</span></button>
        </div>

        {/* Modals */}
        {importing && <div className="absolute inset-0 bg-white/80 z-50 flex items-center justify-center">Importing...</div>}
        {showImport && <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-6"><div className="bg-white w-full rounded-3xl p-6 relative"><button onClick={() => setShowImport(false)} className="absolute top-4 right-4"><X/></button><h3 className="font-bold text-xl mb-4">Import CSV</h3><input type="file" onChange={handleImport} className="w-full"/></div></div>}
        
        {(showAddTx || showTxDetail) && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-end justify-center animate-fade-in">
             <div className="bg-white w-full h-[90%] rounded-t-3xl p-6 shadow-2xl relative flex flex-col">
                <div className="flex justify-between items-center mb-4 shrink-0"><h3 className="font-bold text-xl">{showTxDetail ? 'แก้ไข' : 'เพิ่ม'}รายการ</h3><button onClick={() => { setShowAddTx(false); setShowTxDetail(null); }} className="p-2 bg-slate-100 rounded-full"><X size={24}/></button></div>
                <div className="flex-1 overflow-y-auto">
                   <AddTxForm accounts={accounts} initialData={showTxDetail || newTxData} isEdit={!!showTxDetail} onSave={handleSaveTx} onCancel={() => { setShowAddTx(false); setShowTxDetail(null); }} />
                   {showTxDetail && (
                     <div className="mt-4 flex gap-2">
                       <button onClick={() => handleToggleStatus(showTxDetail)} className={`flex-1 py-3 font-bold rounded-xl ${showTxDetail.status==='paid'?'bg-amber-100 text-amber-600':'bg-emerald-100 text-emerald-600'}`}>{showTxDetail.status==='paid'?'ทำเป็นยังไม่จ่าย':'ยืนยันจ่ายแล้ว'}</button>
                       <button onClick={handleDeleteTx} className="flex-1 py-3 text-rose-500 bg-rose-50 rounded-xl font-bold">ลบรายการ</button>
                     </div>
                   )}
                </div>
             </div>
          </div>
        )}

        {editingAccount && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl h-[80%] overflow-y-auto">
                <h3 className="font-bold text-xl mb-4">{isNewAccount ? 'เพิ่มบัญชี' : 'แก้ไขบัญชี'}</h3>
                <div className="space-y-3">
                   <input type="text" placeholder="ชื่อบัญชี" className="w-full p-3 border rounded-xl" value={editingAccount.name} onChange={e => setEditingAccount({...editingAccount, name: e.target.value})}/>
                   <input type="text" placeholder="ธนาคาร" className="w-full p-3 border rounded-xl" value={editingAccount.bank} onChange={e => setEditingAccount({...editingAccount, bank: e.target.value})}/>
                   <input type="text" placeholder="เลขบัญชี (Optional)" className="w-full p-3 border rounded-xl" value={editingAccount.accountNumber || ''} onChange={e => setEditingAccount({...editingAccount, accountNumber: e.target.value})}/>
                   <select className="w-full p-3 border rounded-xl bg-white" value={editingAccount.type} onChange={e => setEditingAccount({...editingAccount, type: e.target.value as any})}><option value="bank">ธนาคาร</option><option value="credit">บัตรเครดิต</option><option value="cash">เงินสด</option></select>
                   <input type="number" placeholder={editingAccount.type === 'credit' ? 'วงเงินคงเหลือ' : 'ยอดเงิน'} className="w-full p-3 border rounded-xl font-bold text-lg" value={editingAccount.balance} onChange={e => setEditingAccount({...editingAccount, balance: Number(e.target.value)})}/>
                   {editingAccount.type === 'credit' && (
                     <>
                        <input type="number" placeholder="วงเงินทั้งหมด (Limit)" className="w-full p-3 border rounded-xl" value={editingAccount.limit} onChange={e => setEditingAccount({...editingAccount, limit: Number(e.target.value)})}/>
                        <div className="flex gap-2">
                           <input type="number" placeholder="วันสรุปยอด" className="flex-1 p-3 border rounded-xl" value={editingAccount.statementDay || ''} onChange={e => setEditingAccount({...editingAccount, statementDay: Number(e.target.value)})}/>
                           <input type="number" placeholder="วันจ่าย" className="flex-1 p-3 border rounded-xl" value={editingAccount.dueDay || ''} onChange={e => setEditingAccount({...editingAccount, dueDay: Number(e.target.value)})}/>
                        </div>
                     </>
                   )}
                   <div className="flex gap-2 pt-2"><button onClick={() => setEditingAccount(null)} className="flex-1 py-3 bg-slate-100 rounded-xl">ยกเลิก</button><button onClick={handleSaveAccount} className="flex-1 py-3 bg-slate-900 text-white rounded-xl">บันทึก</button></div>
                   {!isNewAccount && <button onClick={handleDeleteAccount} className="w-full py-2 text-rose-500 text-xs">ลบบัญชี</button>}
                </div>
             </div>
          </div>
        )}
      </div>
      <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; } @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } } .animate-fade-in { animation: fade-in 0.2s ease-out; }`}</style>
    </div>
  );
}