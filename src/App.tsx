import React, { useState, useEffect, useMemo } from 'react';
import {
  PieChart,
  CreditCard,
  Plus,
  Trash2,
  Wallet,
  LayoutDashboard,
  List,
  Settings,
  Upload,
  CheckCircle2,
  XCircle,
  TrendingUp,
  DollarSign,
  Calendar,
  ChevronRight,
  Filter,
  ArrowRightLeft,
  Landmark,
  Coins,
  Edit2,
  Save,
  Building,
  MoreHorizontal,
  Search,
  X
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
  writeBatch,
  orderBy,
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
const appId = 'credit-manager-pro-v4-godmode';

// --- Types ---
type AccountType = 'credit' | 'bank' | 'cash';

interface Account {
  id: string;
  name: string;
  bank: string;
  type: AccountType;
  accountNumber?: string;
  limit?: number;        
  balance: number;       
  totalDebt?: number;    
  statementDay?: number;
  dueDay?: number;
  color: string;
  icon?: string;         
}

interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;          // YYYY-MM-DD
  monthKey?: string;     // YYYY-MM for filtering
  accountId: string;     
  toAccountId?: string;  
  status: 'paid' | 'unpaid';
  category: string;
  type: 'expense' | 'income' | 'transfer';
  installment?: string;
  bank?: string;         
}

// --- Helpers ---
const formatCurrency = (val: number) => 
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(val);

const formatDate = (date: string) => 
  date ? new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }).format(new Date(date)) : '-';

const getThaiMonthName = (dateStr: string) => {
  if (!dateStr) return 'ทั้งหมด';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
};

// แปลง "ธ.ค.-68" -> "2025-12-01"
const parseThaiMonthToDate = (str: string) => {
  if (!str) return new Date().toISOString().split('T')[0];
  const parts = str.trim().split(/[-/]/); 
  if (parts.length < 2) return new Date().toISOString().split('T')[0];

  const mStr = parts[0];
  const yStr = parts[1];

  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const monthIndex = months.findIndex(m => mStr.includes(m));
  
  let year = parseInt(yStr);
  if (year < 100) year += 2500; // สมมติว่าเป็น พ.ศ. ย่อ (68 -> 2568)
  year -= 543; // แปลงเป็น ค.ศ.

  if (monthIndex > -1 && !isNaN(year)) {
    // สร้างวันที่ 1 ของเดือนนั้นๆ
    const m = (monthIndex + 1).toString().padStart(2, '0');
    return `${year}-${m}-01`; 
  }
  return new Date().toISOString().split('T')[0];
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
  'เงินสด': 'from-green-600 to-green-800',
  'default': 'from-slate-600 to-slate-800'
};

const getBankColor = (bankName: string) => {
  const key = Object.keys(BANK_COLORS).find(k => bankName?.toLowerCase().includes(k.toLowerCase()));
  return BANK_COLORS[key || 'default'];
};

// --- Components ---

const AccountCard = ({ account, onClick, usage }: { account: Account, onClick: () => void, usage: number }) => (
  <div onClick={onClick} className={`relative p-4 rounded-2xl text-white overflow-hidden bg-gradient-to-br ${account.color} shadow-lg cursor-pointer hover:scale-[1.02] transition-transform border border-white/10`}>
    <div className="flex justify-between items-start mb-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
          {account.type === 'bank' ? <Landmark size={14}/> : account.type === 'cash' ? <Coins size={14}/> : <CreditCard size={14}/>}
        </div>
        <div>
          <p className="text-[10px] opacity-80 uppercase font-medium">{account.bank}</p>
          <p className="font-bold text-lg leading-none">{account.name}</p>
        </div>
      </div>
      <Edit2 size={16} className="opacity-50" />
    </div>
    
    <div className="space-y-1">
      <div className="flex justify-between items-end">
        <p className="text-xs opacity-70">{account.type === 'credit' ? 'วงเงินคงเหลือ' : 'ยอดเงินในบัญชี'}</p>
        <p className="text-xl font-bold">{formatCurrency(account.balance)}</p>
      </div>
      {account.type === 'credit' && account.limit && (
        <div className="w-full bg-black/20 h-1.5 rounded-full overflow-hidden mt-2">
           <div className="bg-white h-full" style={{ width: `${Math.min(((account.limit - account.balance) / account.limit) * 100, 100)}%` }}></div>
        </div>
      )}
      {account.type === 'credit' && (
        <div className="flex justify-between text-[10px] opacity-60 pt-1">
           <span>ใช้ไป: {formatCurrency((account.limit || 0) - account.balance)}</span>
           <span>วงเงิน: {formatCurrency(account.limit || 0)}</span>
        </div>
      )}
      {account.totalDebt && account.totalDebt > 0 && (
         <p className="text-[10px] text-rose-200 mt-1">ภาระหนี้: {formatCurrency(account.totalDebt)}</p>
      )}
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'wallet' | 'transactions' | 'settings'>('dashboard');
  
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false); // New Loading State

  // Modals & Sheets
  const [showAddTx, setShowAddTx] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showTxDetail, setShowTxDetail] = useState<Transaction | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  // Filters
  const [filterMonth, setFilterMonth] = useState<string>(''); // YYYY-MM
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Form State
  const [newTx, setNewTx] = useState<Partial<Transaction>>({
    type: 'expense',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    category: 'ทั่วไป',
    status: 'unpaid'
  });

  // UI Helper
  const [selectedBank, setSelectedBank] = useState<string>('');
  const [selectedType, setSelectedType] = useState<AccountType | ''>('');

  // --- Firebase Init ---
  useEffect(() => {
    const init = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };
    init();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // --- Data Fetching ---
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    
    const unsubAcc = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'accounts'), (snap) => {
      setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Account)));
    });

    const unsubTx = onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), orderBy('createdAt', 'desc')), (snap) => {
      const txData = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
      setTransactions(txData);
      setLoading(false);
    });

    return () => { unsubAcc(); unsubTx(); };
  }, [user]);

  // --- Logic & Stats ---
  
  // Available months for filter
  const availableMonths = useMemo(() => {
    const months = new Set(transactions.map(t => t.date.substring(0, 7)));
    return Array.from(months).sort().reverse();
  }, [transactions]);

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (filterMonth && !t.date.startsWith(filterMonth)) return false;
      if (filterType !== 'all' && t.type !== filterType) return false;
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      return true;
    });
  }, [transactions, filterMonth, filterType, filterStatus]);

  // Monthly Stats
  const monthlyStats = useMemo(() => {
    const income = filteredTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = filteredTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    return { income, expense, balance: income - expense };
  }, [filteredTransactions]);

  const totalAssets = accounts.filter(a => a.type === 'bank' || a.type === 'cash').reduce((sum, a) => sum + a.balance, 0);
  const totalDebt = accounts.reduce((sum, a) => sum + (a.totalDebt || 0), 0);
  // Credit usage logic is a bit complex if not tracking separately, let's rely on limit-balance
  const totalCreditUsed = accounts.filter(a => a.type === 'credit').reduce((sum, a) => sum + ((a.limit || 0) - a.balance), 0);

  // --- Handlers ---

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setImporting(true); // Start Loading

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const buffer = ev.target?.result as ArrayBuffer;
        let text = '';
        try { text = new TextDecoder('utf-8').decode(buffer); } catch (e) {}
        
        // Auto-Detect Encoding
        if (!text.includes('ประเภทบัญชี')) {
          try { text = new TextDecoder('windows-874').decode(buffer); } catch (e) {}
        }
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

        const lines = text.split(/\r\n|\n/).filter(l => l.trim());
        const headerIdx = lines.findIndex(l => (l.includes('ประเภทบัญชี') && l.includes('ธนาคาร')));
        
        if (headerIdx === -1) { 
          throw new Error('รูปแบบไฟล์ไม่ถูกต้อง: หาหัวตาราง "ประเภทบัญชี" ไม่เจอ'); 
        }

        const headers = lines[headerIdx].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const getCol = (key: string) => headers.findIndex(h => h.includes(key));

        // Indices (Updated)
        const idxMonth = getCol('ธุรกรรมเดือน') > -1 ? getCol('ธุรกรรมเดือน') : getCol('รายการเดือน'); 
        const idxType = getCol('ประเภทบัญชี');
        const idxBank = getCol('ธนาคาร');
        const idxName = getCol('ชื่อบัตร');
        const idxNum = getCol('เลขบัตร');
        const idxDesc = getCol('รายละเอียดค่าใช้จ่าย');
        const idxInstallment = getCol('งวดผ่อน');
        const idxAmount = getCol('ยอดชำระ');
        const idxStatus = getCol('สถานะ');
        const idxBalance = getCol('ยอดเงินในบัญชี');
        const idxLimitUsed = getCol('วงเงินที่ใช้ไป');
        const idxLimitRem = getCol('วงเงินคงเหลือ');
        const idxLimitTotal = getCol('วงเงินทั้งหมด');
        const idxDebt = getCol('ภาระหนี้'); // New column
        const idxStatement = getCol('วันสรุปยอด');
        const idxDue = getCol('กำหนดชำระ');
        
        // Chunking Batches (Firebase Limit 500)
        let batch = writeBatch(db);
        let opCount = 0;
        let accCount = 0, txCount = 0;
        
        const existingAccounts = new Map(accounts.map(a => [`${a.bank}-${a.name}`.trim(), a.id]));
        const newAccountsCache = new Map(); 

        const commitBatch = async () => {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        };

        for (let i = headerIdx + 1; i < lines.length; i++) {
          const row = lines[i].split(',');
          if (row.length < 5) continue;

          const clean = (idx: number) => idx > -1 && row[idx] ? row[idx].replace(/^"|"$/g, '').trim() : '';
          const parseNum = (idx: number) => parseFloat(clean(idx).replace(/,/g, '')) || 0;

          const bank = clean(idxBank) || 'Other';
          const name = clean(idxName) || 'General';
          const typeRaw = clean(idxType);
          
          let type: AccountType = 'credit';
          if (typeRaw.includes('บัญชี') || bank.includes('ธนาคาร') || typeRaw.includes('ออมทรัพย์') || typeRaw.includes('Debit')) type = 'bank';
          if (typeRaw.includes('เงินสด')) type = 'cash';

          const balance = parseNum(idxBalance); 
          const limitTotal = parseNum(idxLimitTotal); 
          const limitRem = parseNum(idxLimitRem); 
          const limitUsed = parseNum(idxLimitUsed);
          const debt = parseNum(idxDebt);

          const accKey = `${bank}-${name}`.trim();
          let accId = existingAccounts.get(accKey) || newAccountsCache.get(accKey);

          // Update/Create Account
          if (name && name !== 'N/A') {
             const accData: any = {
               name, bank, type,
               accountNumber: clean(idxNum),
               color: getBankColor(bank),
               statementDay: parseInt(clean(idxStatement)) || 0,
               dueDay: parseInt(clean(idxDue)) || 0,
               updatedAt: serverTimestamp()
             };

             // Debt Mapping
             if (debt > 0) accData.totalDebt = debt;

             // Balance/Limit Logic
             if (type === 'credit') {
               // ✅ FIX: Use 0 instead of undefined
               accData.limit = limitTotal > 0 ? limitTotal : 0; 
               
               if (limitRem > 0) accData.balance = limitRem;
               else if (limitTotal > 0 && limitUsed > 0) accData.balance = limitTotal - limitUsed;
               else if (typeof accData.balance === 'undefined') accData.balance = 0; // Ensure not undefined
             } else {
               if (balance > 0) accData.balance = balance;
               else if (typeof accData.balance === 'undefined') accData.balance = 0;
             }

             if (accId) {
               batch.update(doc(db, 'artifacts', appId, 'users', user.uid, 'accounts', accId), accData);
             } else {
               const ref = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'accounts'));
               batch.set(ref, { ...accData, balance: accData.balance || 0, createdAt: serverTimestamp() });
               accId = ref.id;
               newAccountsCache.set(accKey, accId);
               accCount++;
             }
             opCount++;
          }

          // Create Transaction
          const desc = clean(idxDesc);
          const amount = parseNum(idxAmount);
          const monthStr = clean(idxMonth);
          
          if (accId && desc && desc !== 'ไม่มี' && desc !== 'N/A' && amount > 0) {
             const txRef = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'));
             const isPaid = clean(idxStatus).includes('จ่ายแล้ว');
             const date = monthStr ? parseThaiMonthToDate(monthStr) : new Date().toISOString().split('T')[0];

             batch.set(txRef, {
               accountId: accId,
               description: desc,
               amount,
               date: date,
               status: isPaid ? 'paid' : 'unpaid',
               type: 'expense',
               category: 'Import',
               installment: clean(idxInstallment),
               createdAt: serverTimestamp()
             });
             txCount++;
             opCount++;
          }

          // Check Batch Limit
          if (opCount >= 400) await commitBatch();
        }

        if (opCount > 0) await commitBatch();
        
        alert(`✅ นำเข้าสำเร็จ!\n- บัญชี: ${accCount}\n- รายการ: ${txCount}`);
        setShowImport(false);

      } catch (err: any) {
        console.error(err);
        alert(`❌ เกิดข้อผิดพลาด: ${err.message}`);
      } finally {
        setImporting(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSaveTx = async () => {
    if (!user || !newTx.amount || !newTx.accountId) return alert('กรอกข้อมูลไม่ครบ');
    const payload = { ...newTx, amount: Number(newTx.amount), updatedAt: serverTimestamp() };
    if (newTx.id) await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', newTx.id), payload);
    else await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), { ...payload, createdAt: serverTimestamp() });
    setShowAddTx(false); setShowTxDetail(null);
    setNewTx({ type: 'expense', amount: 0, date: new Date().toISOString().split('T')[0], category: 'ทั่วไป', status: 'unpaid' });
  };

  const handleUpdateAccount = async () => {
    if (!user || !editingAccount) return;
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'accounts', editingAccount.id), {
      name: editingAccount.name,
      type: editingAccount.type,
      balance: Number(editingAccount.balance),
      limit: editingAccount.type === 'credit' ? Number(editingAccount.limit) : 0,
      totalDebt: editingAccount.totalDebt ? Number(editingAccount.totalDebt) : 0,
      bank: editingAccount.bank,
      color: editingAccount.color 
    });
    setEditingAccount(null);
  };

  const handleDeleteTx = async () => {
    if (!user || !newTx.id || !confirm('ยืนยันลบ?')) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', newTx.id));
    setShowTxDetail(null);
  };

  const handleClearAll = async () => {
    if (!confirm('ล้างข้อมูลทั้งหมด?')) return;
    setLoading(true);
    // Chunking Delete
    const batchSize = 400;
    const allAcc = accounts.map(a => doc(db, 'artifacts', appId, 'users', user.uid, 'accounts', a.id));
    const allTx = transactions.map(t => doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', t.id));
    const allDocs = [...allAcc, ...allTx];

    for (let i = 0; i < allDocs.length; i += batchSize) {
      const batch = writeBatch(db);
      allDocs.slice(i, i + batchSize).forEach(ref => batch.delete(ref));
      await batch.commit();
    }
    setLoading(false);
    alert('ล้างข้อมูลเรียบร้อย');
  };

  // --- Views ---

  // Fix SettingsView White Screen: Simplified Rendering
  const SettingsView = () => (
    <div className="pt-4 px-1">
      <h2 className="text-2xl font-bold mb-6">ตั้งค่า</h2>
      
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
        <button onClick={() => setShowImport(true)} className="w-full p-4 border-b border-slate-50 flex items-center gap-4 hover:bg-slate-50 text-left">
           <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600"><Upload size={20}/></div>
           <div className="flex-1">
             <p className="font-bold text-slate-800">นำเข้าไฟล์ CSV</p>
             <p className="text-xs text-slate-400">รองรับไฟล์ Life-Balance2.csv</p>
           </div>
           <ChevronRight size={20} className="text-slate-300"/>
        </button>
        
        <button onClick={handleClearAll} className="w-full p-4 flex items-center gap-4 hover:bg-rose-50 group text-left">
           <div className="w-10 h-10 bg-rose-50 rounded-full flex items-center justify-center text-rose-600 group-hover:bg-rose-200"><Trash2 size={20}/></div>
           <div className="flex-1">
             <p className="font-bold text-rose-600">ล้างข้อมูลทั้งหมด</p>
             <p className="text-xs text-slate-400">ลบบัญชีและรายการทั้งหมด (กู้คืนไม่ได้)</p>
           </div>
        </button>
      </div>

      <div className="mt-8 text-center text-xs text-slate-300">
        User: {user?.uid?.slice(0, 8) || 'Guest'}
      </div>
    </div>
  );

  const Dashboard = () => (
    <div className="space-y-6 pb-24">
      {/* Monthly Summary */}
      <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-24 bg-blue-500 opacity-10 rounded-full blur-3xl translate-x-10 -translate-y-10"></div>
        <div className="relative z-10">
          <div className="flex justify-between items-center mb-4">
             <p className="text-slate-400 text-xs">สรุปธุรกรรม {filterMonth ? `(${getThaiMonthName(filterMonth + '-01')})` : '(ทั้งหมด)'}</p>
             <select 
               className="bg-white/10 text-xs p-1 rounded border-none outline-none text-white"
               value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
             >
                <option value="">ทั้งหมด</option>
                {availableMonths.map(m => <option key={m} value={m}>{getThaiMonthName(m + '-01')}</option>)}
             </select>
          </div>
          
          <div className="flex gap-4 items-end mb-6">
             <div>
               <p className="text-[10px] text-emerald-400 mb-1">รายรับ</p>
               <p className="text-2xl font-bold">{formatCurrency(monthlyStats.income)}</p>
             </div>
             <div className="h-8 w-px bg-white/20"></div>
             <div>
               <p className="text-[10px] text-rose-400 mb-1">รายจ่าย</p>
               <p className="text-2xl font-bold">{formatCurrency(monthlyStats.expense)}</p>
             </div>
          </div>

          <div className="bg-white/10 p-4 rounded-2xl border border-white/5 flex justify-between items-center">
             <div>
               <p className="text-xs text-slate-300">คงเหลือสุทธิ</p>
               <p className={`text-xl font-bold ${monthlyStats.balance >= 0 ? 'text-blue-300' : 'text-rose-300'}`}>{formatCurrency(monthlyStats.balance)}</p>
             </div>
             <div className="text-right">
                <p className="text-[10px] text-slate-400">ใช้จ่ายบัตรเครดิตสะสม</p>
                <p className="text-sm font-medium text-rose-300">{formatCurrency(totalCreditUsed)}</p>
             </div>
          </div>
        </div>
      </div>

      {/* Account Snapshot */}
      <div>
        <div className="flex justify-between items-center mb-3 px-1">
          <h3 className="font-bold text-slate-800">บัญชีของฉัน</h3>
          <button onClick={() => setActiveTab('wallet')} className="text-xs text-blue-600">จัดการ</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
           <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-2 mb-2 text-slate-500">
                 <Landmark size={16}/> <span className="text-xs font-medium">เงินสด/ฝาก</span>
              </div>
              <p className="text-lg font-bold text-slate-800">{formatCurrency(totalAssets)}</p>
           </div>
           <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-2 mb-2 text-slate-500">
                 <CreditCard size={16}/> <span className="text-xs font-medium">ภาระหนี้ทั้งหมด</span>
              </div>
              <p className="text-lg font-bold text-rose-600">{formatCurrency(totalDebt)}</p>
           </div>
        </div>
      </div>
    </div>
  );

  const WalletView = () => {
    const grouped = useMemo(() => {
      const g: Record<string, Account[]> = {};
      accounts.forEach(acc => {
        if (!g[acc.bank]) g[acc.bank] = [];
        g[acc.bank].push(acc);
      });
      return g;
    }, [accounts]);

    return (
      <div className="pb-24 pt-4 space-y-6">
        <h2 className="text-2xl font-bold px-1">กระเป๋าตังค์ <span className="text-sm font-normal text-slate-400">(แตะเพื่อแก้ไข)</span></h2>
        
        {Object.entries(grouped).map(([bankName, accs]) => (
          <div key={bankName} className="space-y-2">
             <div className="flex items-center gap-2 px-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold bg-gradient-to-br ${getBankColor(bankName)}`}>
                  {bankName.substring(0, 1)}
                </div>
                <h3 className="font-bold text-md text-slate-700">{bankName}</h3>
             </div>
             
             <div className="space-y-3">
               {accs.map(acc => (
                 <AccountCard key={acc.id} account={acc} onClick={() => setEditingAccount(acc)} usage={0} />
               ))}
             </div>
          </div>
        ))}
      </div>
    );
  };

  const TransactionsView = () => (
    <div className="pt-4 pb-24 h-full flex flex-col">
      <div className="px-1 mb-4">
        <h2 className="text-2xl font-bold mb-3">ธุรกรรม</h2>
        
        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
           <select 
             className="bg-white border border-slate-200 text-xs p-2 rounded-lg outline-none shadow-sm min-w-[100px]"
             value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
           >
             <option value="">ทุกเดือน</option>
             {availableMonths.map(m => <option key={m} value={m}>{getThaiMonthName(m + '-01')}</option>)}
           </select>
           
           <select 
             className="bg-white border border-slate-200 text-xs p-2 rounded-lg outline-none shadow-sm"
             value={filterType} onChange={e => setFilterType(e.target.value)}
           >
             <option value="all">ทุกประเภท</option>
             <option value="expense">รายจ่าย</option>
             <option value="income">รายรับ</option>
             <option value="transfer">โอนเงิน</option>
           </select>

           <select 
             className="bg-white border border-slate-200 text-xs p-2 rounded-lg outline-none shadow-sm"
             value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
           >
             <option value="all">ทุกสถานะ</option>
             <option value="paid">จ่ายแล้ว</option>
             <option value="unpaid">รอจ่าย</option>
           </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 hide-scrollbar">
        {filteredTransactions.length === 0 && <div className="text-center text-slate-400 py-10">ไม่พบรายการ</div>}
        {filteredTransactions.map(tx => {
          const acc = accounts.find(a => a.id === tx.accountId);
          return (
            <div 
              key={tx.id} 
              onClick={() => { setNewTx(tx); setShowTxDetail(tx); }}
              className="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center active:bg-slate-50 cursor-pointer"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-lg ${tx.type === 'income' ? 'bg-emerald-100' : tx.type === 'transfer' ? 'bg-blue-100' : 'bg-rose-50'}`}>
                  {tx.type === 'income' ? '💰' : tx.type === 'transfer' ? '🔁' : '💸'}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 truncate text-sm">{tx.description}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    {formatDate(tx.date)} • <span className="bg-slate-100 px-1 rounded truncate max-w-[100px]">{acc?.bank || 'Unk'} {acc?.name}</span>
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0 pl-2">
                <p className={`font-bold ${tx.type === 'income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                  {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}{formatCurrency(tx.amount)}
                </p>
                {tx.status === 'unpaid' && <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">รอจ่าย</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const AddTxForm = ({ isEdit = false }) => {
    const banks = useMemo(() => Array.from(new Set(accounts.map(a => a.bank))), [accounts]);
    const filteredAccounts = useMemo(() => {
      let filtered = accounts;
      if (selectedBank) filtered = filtered.filter(a => a.bank === selectedBank);
      if (selectedType) filtered = filtered.filter(a => a.type === selectedType);
      return filtered;
    }, [accounts, selectedBank, selectedType]);

    return (
      <div className="space-y-6">
        <div className="flex bg-slate-100 p-1 rounded-xl">
          {['expense', 'income', 'transfer'].map((t) => (
            <button
              key={t} onClick={() => setNewTx({ ...newTx, type: t as any })}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold capitalize transition ${newTx.type === t ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}
            >
              {t === 'expense' ? 'รายจ่าย' : t === 'income' ? 'รายรับ' : 'โอน/จ่าย'}
            </button>
          ))}
        </div>

        <div className="text-center">
          <input
            type="number" className="text-5xl font-bold text-center w-full bg-transparent border-none focus:ring-0 placeholder:text-slate-200 text-slate-800"
            placeholder="0" value={newTx.amount || ''}
            onChange={e => setNewTx({ ...newTx, amount: parseFloat(e.target.value) })}
            autoFocus={!isEdit}
          />
          <p className="text-xs text-slate-400 mt-1">บาท</p>
        </div>

        <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
           <p className="text-xs font-bold text-slate-400 uppercase">เลือกบัญชี / บัตร</p>
           <div className="grid grid-cols-2 gap-2">
             <select className="p-3 rounded-xl border border-slate-200 text-sm outline-none" value={selectedBank} onChange={e => { setSelectedBank(e.target.value); setSelectedType(''); }}>
               <option value="">ทุกธนาคาร</option>
               {banks.map(b => <option key={b} value={b}>{b}</option>)}
             </select>
             <select className="p-3 rounded-xl border border-slate-200 text-sm outline-none" value={selectedType} onChange={e => setSelectedType(e.target.value as AccountType)}>
               <option value="">ทุกประเภท</option>
               <option value="bank">บัญชีธนาคาร</option>
               <option value="credit">บัตรเครดิต</option>
               <option value="cash">เงินสด</option>
             </select>
           </div>
           <select className="w-full p-3 rounded-xl border border-slate-200 text-sm font-semibold bg-white outline-none" value={newTx.accountId || ''} onChange={e => setNewTx({ ...newTx, accountId: e.target.value })}>
             <option value="">-- เลือกบัญชี --</option>
             {filteredAccounts.map(a => (
               <option key={a.id} value={a.id}>{a.bank} - {a.name} ({formatCurrency(a.balance)})</option>
             ))}
           </select>
        </div>

        {newTx.type === 'transfer' && (
          <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 space-y-2">
             <p className="text-xs font-bold text-blue-400 uppercase flex items-center gap-1"><ArrowRightLeft size={12}/> โอนไปที่ / จ่ายบิล</p>
             <select className="w-full p-3 rounded-xl border border-blue-200 text-sm font-semibold bg-white outline-none" value={newTx.toAccountId || ''} onChange={e => setNewTx({ ...newTx, toAccountId: e.target.value })}>
               <option value="">-- เลือกปลายทาง --</option>
               {accounts.filter(a => a.id !== newTx.accountId).map(a => <option key={a.id} value={a.id}>{a.type === 'credit' ? '💳' : '🏦'} {a.bank} - {a.name}</option>)}
             </select>
          </div>
        )}

        <div className="space-y-3">
           <input type="text" placeholder="รายละเอียด (เช่น ค่ากาแฟ)" className="w-full p-4 rounded-xl border border-slate-200 outline-none" value={newTx.description || ''} onChange={e => setNewTx({ ...newTx, description: e.target.value })}/>
           <div className="flex gap-3">
             <input type="date" className="flex-1 p-3 rounded-xl border border-slate-200 text-sm text-center" value={newTx.date} onChange={e => setNewTx({ ...newTx, date: e.target.value })}/>
             <select className={`flex-1 p-3 rounded-xl border border-slate-200 text-sm text-center font-bold ${newTx.status === 'paid' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-amber-600 bg-amber-50 border-amber-200'}`} value={newTx.status} onChange={e => setNewTx({ ...newTx, status: e.target.value as any })}>
               <option value="paid">จ่ายแล้ว</option>
               <option value="unpaid">ยังไม่จ่าย</option>
             </select>
           </div>
        </div>

        <div className="pt-4 flex gap-3">
           {isEdit && <button onClick={handleDeleteTx} className="flex-none w-14 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center"><Trash2 size={20}/></button>}
           <button onClick={handleSaveTx} className="flex-1 py-4 bg-slate-900 text-white rounded-xl font-bold shadow-lg active:scale-95 transition">{isEdit ? 'บันทึกการแก้ไข' : 'ยืนยันรายการ'}</button>
        </div>
      </div>
    );
  };

  const EditAccountModal = () => {
    if (!editingAccount) return null;
    return (
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
         <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl relative animate-zoom-in">
            <h3 className="font-bold text-xl mb-4 text-slate-800">แก้ไขบัญชี</h3>
            <div className="space-y-3">
               <div>
                 <label className="text-xs text-slate-400">ชื่อบัญชี</label>
                 <input type="text" className="w-full p-3 border rounded-xl" value={editingAccount.name} onChange={e => setEditingAccount({...editingAccount, name: e.target.value})}/>
               </div>
               <div>
                 <label className="text-xs text-slate-400">ธนาคาร</label>
                 <input type="text" className="w-full p-3 border rounded-xl" value={editingAccount.bank} onChange={e => setEditingAccount({...editingAccount, bank: e.target.value})}/>
               </div>
               <div>
                 <label className="text-xs text-slate-400">ประเภท</label>
                 <select className="w-full p-3 border rounded-xl bg-white" value={editingAccount.type} onChange={e => setEditingAccount({...editingAccount, type: e.target.value as any})}>
                    <option value="bank">บัญชีธนาคาร</option>
                    <option value="credit">บัตรเครดิต</option>
                    <option value="cash">เงินสด</option>
                 </select>
               </div>
               <div>
                 <label className="text-xs text-slate-400">{editingAccount.type === 'credit' ? 'วงเงินคงเหลือ (Available)' : 'ยอดเงินในบัญชี'}</label>
                 <input type="number" className="w-full p-3 border rounded-xl font-bold" value={editingAccount.balance} onChange={e => setEditingAccount({...editingAccount, balance: Number(e.target.value)})}/>
               </div>
               {editingAccount.type === 'credit' && (
                 <div>
                   <label className="text-xs text-slate-400">วงเงินทั้งหมด (Limit)</label>
                   <input type="number" className="w-full p-3 border rounded-xl" value={editingAccount.limit} onChange={e => setEditingAccount({...editingAccount, limit: Number(e.target.value)})}/>
                 </div>
               )}
               {editingAccount.totalDebt !== undefined && (
                 <div>
                   <label className="text-xs text-slate-400">ภาระหนี้ (Debt Burden)</label>
                   <input type="number" className="w-full p-3 border rounded-xl" value={editingAccount.totalDebt} onChange={e => setEditingAccount({...editingAccount, totalDebt: Number(e.target.value)})}/>
                 </div>
               )}
               <div className="pt-2 flex gap-2">
                  <button onClick={() => setEditingAccount(null)} className="flex-1 py-3 text-slate-500 bg-slate-100 rounded-xl">ยกเลิก</button>
                  <button onClick={handleUpdateAccount} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold">บันทึก</button>
               </div>
            </div>
         </div>
      </div>
    );
  };

  if (loading) return <div className="h-screen flex items-center justify-center text-slate-400 bg-slate-50">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 flex justify-center">
      <div className="w-full max-w-md bg-white sm:my-8 sm:rounded-[2.5rem] sm:shadow-2xl sm:border-[8px] sm:border-slate-800 flex flex-col relative overflow-hidden h-[100dvh] sm:h-[850px]">
        
        {/* Top Bar */}
        <div className="px-6 pt-12 pb-2 bg-white flex justify-between items-center shrink-0 z-20">
           <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center text-white font-bold">ME</div>
             <div>
               <p className="text-[10px] text-slate-400 uppercase tracking-wider">Financial Manager</p>
               <p className="font-bold text-lg">My Balance</p>
             </div>
           </div>
           <button onClick={() => setActiveTab('settings')} className="p-2 bg-slate-50 rounded-full text-slate-600 hover:bg-slate-100"><Settings size={20}/></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 hide-scrollbar bg-white relative z-10">
           {importing && (
             <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mb-4"></div>
                <p className="text-slate-600 font-medium animate-pulse">กำลังนำเข้าข้อมูล...</p>
             </div>
           )}
           {activeTab === 'dashboard' && <Dashboard />}
           {activeTab === 'wallet' && <WalletView />}
           {activeTab === 'transactions' && <TransactionsView />}
           {activeTab === 'settings' && <SettingsView />}
        </div>

        {/* Bottom Nav */}
        <div className="bg-white/90 backdrop-blur-md border-t border-slate-100 py-3 px-6 flex justify-between items-center shrink-0 z-20 pb-6 sm:pb-3">
           <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 transition ${activeTab === 'dashboard' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><LayoutDashboard size={24} strokeWidth={activeTab === 'dashboard' ? 2.5 : 2} /><span className="text-[10px] font-medium">ภาพรวม</span></button>
           <button onClick={() => setActiveTab('wallet')} className={`flex flex-col items-center gap-1 transition ${activeTab === 'wallet' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><Wallet size={24} strokeWidth={activeTab === 'wallet' ? 2.5 : 2} /><span className="text-[10px] font-medium">กระเป๋า</span></button>
           <div className="relative -top-6"><button onClick={() => { setNewTx({ type: 'expense', amount: 0, date: new Date().toISOString().split('T')[0], status: 'unpaid' }); setShowAddTx(true); }} className="bg-slate-900 text-white w-14 h-14 rounded-full shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition border-4 border-white"><Plus size={28} /></button></div>
           <button onClick={() => setActiveTab('transactions')} className={`flex flex-col items-center gap-1 transition ${activeTab === 'transactions' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><List size={24} strokeWidth={activeTab === 'transactions' ? 2.5 : 2} /><span className="text-[10px] font-medium">รายการ</span></button>
           <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 transition ${activeTab === 'settings' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><Settings size={24} strokeWidth={activeTab === 'settings' ? 2.5 : 2} /><span className="text-[10px] font-medium">ตั้งค่า</span></button>
        </div>

        {/* Modals */}
        {showImport && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in">
             <div className="bg-white w-full rounded-3xl p-6 shadow-2xl relative">
                <button onClick={() => setShowImport(false)} className="absolute top-4 right-4 text-slate-400"><XCircle /></button>
                <div className="text-center mb-6">
                   <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4"><Upload size={32}/></div>
                   <h3 className="font-bold text-xl">Import Data</h3>
                   <p className="text-sm text-slate-500 mt-1">ใช้ไฟล์ Life-Balance2.csv เท่านั้น</p>
                </div>
                <input type="file" accept=".csv" onChange={handleImport} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"/>
             </div>
          </div>
        )}

        {(showAddTx || showTxDetail) && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center animate-fade-in">
             <div className="bg-white w-full h-[90%] rounded-t-3xl p-6 shadow-2xl overflow-y-auto animate-slide-up relative">
                <div className="flex justify-between items-center mb-6">
                   <h3 className="font-bold text-xl text-slate-800">{showTxDetail ? 'แก้ไขรายการ' : 'รายการใหม่'}</h3>
                   <button onClick={() => { setShowAddTx(false); setShowTxDetail(null); }} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200"><XCircle size={24}/></button>
                </div>
                <AddTxForm isEdit={!!showTxDetail} />
             </div>
          </div>
        )}

        <EditAccountModal />

      </div>
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes zoom-in { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-slide-up { animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-fade-in { animation: fade-in 0.2s ease-out; }
        .animate-zoom-in { animation: zoom-in 0.2s ease-out; }
      `}</style>
    </div>
  );
}