import React, { useState, useEffect, useMemo } from 'react';
import {
  PieChart, CreditCard, Plus, Trash2, Wallet, LayoutDashboard, List, Settings, Upload,
  CheckCircle2, XCircle, TrendingUp, DollarSign, Calendar, ChevronRight, Filter,
  ArrowRightLeft, Landmark, Coins, Edit2, Save, Building, MoreHorizontal, Search, X, LogOut, Lock
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import {
  getFirestore, collection, addDoc, query, onSnapshot, deleteDoc, doc, updateDoc,
  serverTimestamp, writeBatch, orderBy, getDoc, runTransaction, increment
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
const appId = 'credit-manager-pro-v5-master';

// --- Types ---
type AccountType = 'credit' | 'bank' | 'cash';

interface Account {
  id: string;
  name: string;
  bank: string;
  type: AccountType;
  accountNumber?: string;
  limit?: number;        // วงเงิน (Credit)
  balance: number;       // ยอดคงเหลือ (Bank/Cash) หรือ วงเงินคงเหลือ (Credit)
  totalDebt?: number;    // ภาระหนี้สิน
  statementDay?: number;
  dueDay?: number;
  color: string;
}

interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  monthKey?: string;
  accountId: string;     // Source
  toAccountId?: string;  // Destination
  status: 'paid' | 'unpaid';
  category: string;
  type: 'expense' | 'income' | 'transfer';
  installment?: string;
}

// --- Helpers ---
const formatCurrency = (val: number) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(val);
const formatDate = (date: string) => date ? new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }).format(new Date(date)) : '-';
const getThaiMonthName = (dateStr: string) => {
  if (!dateStr) return 'ทั้งหมด';
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? dateStr : date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
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

const getBankColor = (bankName: string) => {
  const key = Object.keys(BANK_COLORS).find(k => bankName?.toLowerCase().includes(k.toLowerCase()));
  return BANK_COLORS[key || 'default'];
};

// --- Sub-Components (Defined outside to prevent re-render focus loss) ---

const AccountCard = ({ account, onClick }: { account: Account, onClick: () => void }) => (
  <div onClick={onClick} className={`relative p-4 rounded-2xl text-white overflow-hidden bg-gradient-to-br ${account.color} shadow-lg cursor-pointer hover:scale-[1.02] transition-transform border border-white/10`}>
    <div className="flex justify-between items-start mb-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
          {account.type === 'bank' ? <Landmark size={14}/> : account.type === 'cash' ? <Coins size={14}/> : <CreditCard size={14}/>}
        </div>
        <div>
          <p className="text-[10px] opacity-80 uppercase font-medium">{account.bank}</p>
          <p className="font-bold text-lg leading-none truncate w-32">{account.name}</p>
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
        </>
      )}
    </div>
  </div>
);

// Form Component (Isolated for performance)
const AddTxForm = ({ 
  accounts, 
  initialData, 
  onSave, 
  onCancel, 
  isEdit 
}: { 
  accounts: Account[], 
  initialData: Partial<Transaction>, 
  onSave: (data: Partial<Transaction>) => void, 
  onCancel: () => void,
  isEdit: boolean 
}) => {
  const [formData, setFormData] = useState(initialData);
  const [selectedBank, setSelectedBank] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');

  // Dropdown Helpers
  const banks = useMemo(() => Array.from(new Set(accounts.map(a => a.bank))).sort(), [accounts]);
  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => {
      if (selectedBank && a.bank !== selectedBank) return false;
      if (selectedType && a.type !== selectedType) return false;
      return true;
    });
  }, [accounts, selectedBank, selectedType]);

  const handleSubmit = () => {
    if(!formData.amount || !formData.accountId) return alert('กรุณากรอกข้อมูลให้ครบ');
    onSave(formData);
  };

  return (
    <div className="space-y-5 pb-10">
      {/* Type Toggle */}
      <div className="flex bg-slate-100 p-1 rounded-xl">
        {[
          { id: 'expense', label: 'รายจ่าย', color: 'text-rose-600' },
          { id: 'income', label: 'รายรับ', color: 'text-emerald-600' },
          { id: 'transfer', label: 'โอน/ชำระ', color: 'text-blue-600' }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setFormData({ ...formData, type: t.id as any })}
            className={`flex-1 py-3 rounded-lg text-sm font-bold transition ${formData.type === t.id ? `bg-white shadow ${t.color}` : 'text-slate-400'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Amount Input (Large) */}
      <div className="text-center relative">
        <input
          type="number"
          className="text-5xl font-bold text-center w-full bg-transparent border-none focus:ring-0 placeholder:text-slate-200 text-slate-800 p-0"
          placeholder="0"
          value={formData.amount || ''}
          onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
          autoFocus={!isEdit} // Auto focus only on new items
        />
        <p className="text-xs text-slate-400 mt-2">บาท</p>
      </div>

      {/* Account Selector */}
      <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
         <p className="text-xs font-bold text-slate-400 uppercase">
           {formData.type === 'income' ? 'เข้าบัญชี' : formData.type === 'transfer' ? 'จากบัญชี (ต้นทาง)' : 'จ่ายด้วย'}
         </p>
         <div className="grid grid-cols-2 gap-2">
           <select className="p-3 rounded-xl border border-slate-200 text-sm outline-none bg-white" value={selectedBank} onChange={e => { setSelectedBank(e.target.value); setSelectedType(''); }}>
             <option value="">ทุกธนาคาร</option>
             {banks.map(b => <option key={b} value={b}>{b}</option>)}
           </select>
           <select className="p-3 rounded-xl border border-slate-200 text-sm outline-none bg-white" value={selectedType} onChange={e => setSelectedType(e.target.value)}>
             <option value="">ทุกประเภท</option>
             <option value="bank">บัญชี</option>
             <option value="credit">บัตรเครดิต</option>
             <option value="cash">เงินสด</option>
           </select>
         </div>
         <select 
            className="w-full p-3 rounded-xl border border-slate-200 text-sm font-semibold bg-white outline-none focus:ring-2 focus:ring-slate-900" 
            value={formData.accountId || ''} 
            onChange={e => setFormData({ ...formData, accountId: e.target.value })}
         >
           <option value="">-- เลือกบัญชี --</option>
           {filteredAccounts.map(a => (
             <option key={a.id} value={a.id}>{a.bank} - {a.name} ({formatCurrency(a.balance)})</option>
           ))}
         </select>
      </div>

      {/* Destination (For Transfer) */}
      {formData.type === 'transfer' && (
        <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 space-y-2">
           <p className="text-xs font-bold text-blue-400 uppercase flex items-center gap-1"><ArrowRightLeft size={12}/> ไปยัง / ชำระบัตร</p>
           <select 
             className="w-full p-3 rounded-xl border border-blue-200 text-sm font-semibold bg-white outline-none focus:ring-2 focus:ring-blue-500" 
             value={formData.toAccountId || ''} 
             onChange={e => setFormData({ ...formData, toAccountId: e.target.value })}
           >
             <option value="">-- เลือกปลายทาง --</option>
             {accounts.filter(a => a.id !== formData.accountId).map(a => (
               <option key={a.id} value={a.id}>{a.type === 'credit' ? '💳' : '🏦'} {a.bank} - {a.name}</option>))}
           </select>
        </div>
      )}

      {/* Details */}
      <div className="space-y-3">
         <input 
           type="text" 
           placeholder="รายละเอียด (เช่น ค่ากาแฟ, ผ่อนงวด 1)" 
           className="w-full p-4 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-slate-900" 
           value={formData.description || ''} 
           onChange={e => setFormData({ ...formData, description: e.target.value })}
         />
         <div className="flex gap-3">
           <input 
             type="date" 
             className="flex-1 p-3 rounded-xl border border-slate-200 text-sm text-center bg-white" 
             value={formData.date} 
             onChange={e => setFormData({ ...formData, date: e.target.value })}
           />
           {formData.type === 'expense' && (
             <select 
               className={`flex-1 p-3 rounded-xl border border-slate-200 text-sm text-center font-bold ${formData.status === 'paid' ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'}`} 
               value={formData.status} 
               onChange={e => setFormData({ ...formData, status: e.target.value as any })}
             >
               <option value="paid">จ่ายแล้ว</option>
               <option value="unpaid">รอจ่าย</option>
             </select>
           )}
         </div>
      </div>

      {/* Buttons */}
      <div className="pt-4 flex gap-3">
         <button onClick={onCancel} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-xl font-bold">ยกเลิก</button>
         <button onClick={handleSubmit} className="flex-[2] py-4 bg-slate-900 text-white rounded-xl font-bold shadow-lg active:scale-95 transition">
           {isEdit ? 'บันทึกการแก้ไข' : 'บันทึกรายการ'}
         </button>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'wallet' | 'transactions' | 'settings'>('dashboard');
  
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

  // Modals
  const [showAddTx, setShowAddTx] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showTxDetail, setShowTxDetail] = useState<Transaction | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isNewAccount, setIsNewAccount] = useState(false);

  // Filters
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');

  // Firebase Auth
  useEffect(() => {
    const init = async () => {
      try {
        const provider = new GoogleAuthProvider();
        await signInAnonymously(auth); // Default to Anon for demo, can switch to Google
      } catch (e) { console.error(e); }
    };
    init();
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); });
  }, []);

  // Login
  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      alert("Login Error: " + error.message);
    }
  };

  const handleLogout = async () => {
    if (confirm('ออกจากระบบ?')) await signOut(auth);
  };

  // Data Fetching
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsubAcc = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'accounts'), (snap) => {
      setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Account)));
    });
    const unsubTx = onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), orderBy('createdAt', 'desc')), (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
      setLoading(false);
    });
    return () => { unsubAcc(); unsubTx(); };
  }, [user]);

  // --- Logic for Balance Update (The Core Fix) ---
  const updateAccountBalance = async (accountId: string, amountChange: number) => {
    const ref = doc(db, 'artifacts', appId, 'users', user!.uid, 'accounts', accountId);
    // ใช้ increment เพื่อความ Atomic (ปลอดภัยกว่า)
    await updateDoc(ref, { balance: increment(amountChange) });
  };

  const handleSaveTx = async (txData: Partial<Transaction>) => {
    if (!user) return;
    
    try {
      const amount = Number(txData.amount);
      const isEdit = !!txData.id;
      
      // 1. ถ้าเป็นการแก้ไข ต้องคืนค่าเดิมกลับไปก่อน (Revert Old Impact)
      if (isEdit) {
        const oldTx = transactions.find(t => t.id === txData.id);
        if (oldTx) {
          // Revert logic is complex, for simplicity in this demo we will just Delete -> Re-Add logic effectively
          // But here, let's just do a simple reverse update first
          if (oldTx.type === 'income') await updateAccountBalance(oldTx.accountId, -oldTx.amount);
          if (oldTx.type === 'expense' && (oldTx.status === 'paid' || accounts.find(a => a.id === oldTx.accountId)?.type !== 'credit')) {
             // Revert expense: Add money back. Note: Credit Card expense only reduces balance (limit) if it was created.
             // For Credit Card: Expense reduces "Available Balance". So reverting means adding it back.
             await updateAccountBalance(oldTx.accountId, oldTx.amount);
          }
          if (oldTx.type === 'transfer' && oldTx.toAccountId) {
             await updateAccountBalance(oldTx.accountId, oldTx.amount); // Give back to source
             await updateAccountBalance(oldTx.toAccountId, -oldTx.amount); // Take from dest
          }
        }
      }

      // 2. Apply New Impact
      if (txData.type === 'income') {
        // รายรับ: เงินเพิ่ม
        await updateAccountBalance(txData.accountId!, amount);
      } 
      else if (txData.type === 'expense') {
        // รายจ่าย: 
        // - บัตรเครดิต: ลดวงเงินคงเหลือ (ไม่สนสถานะ paid/unpaid เพราะรูดปุ๊บวงเงินหายปั๊บ)
        // - เงินสด/แบงก์: ลดเงินทันที
        await updateAccountBalance(txData.accountId!, -amount);
      } 
      else if (txData.type === 'transfer' && txData.toAccountId) {
        // โอนเงิน: ต้นทางลด ปลายทางเพิ่ม
        await updateAccountBalance(txData.accountId!, -amount); // Source decrease
        
        // ถ้าโอนไปจ่ายบัตรเครดิต (Payment) -> วงเงินบัตรต้องเพิ่มกลับมา
        // ถ้าโอนไปบัญชีอื่น -> ยอดเงินเพิ่ม
        await updateAccountBalance(txData.toAccountId, amount); // Dest increase
      }

      // 3. Save Transaction Doc
      const payload = { ...txData, amount, updatedAt: serverTimestamp() };
      if (isEdit && txData.id) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', txData.id), payload);
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), {
          ...payload,
          createdAt: serverTimestamp()
        });
      }

      setShowAddTx(false);
      setShowTxDetail(null);
    } catch (e) {
      console.error(e);
      alert('เกิดข้อผิดพลาดในการบันทึก');
    }
  };

  const handleDeleteTx = async () => {
    if (!user || !showTxDetail) return;
    if (!confirm('ยืนยันการลบ? ยอดเงินจะถูกคำนวณกลับคืน')) return;

    // Revert Balance Logic
    const oldTx = showTxDetail;
    if (oldTx.type === 'income') await updateAccountBalance(oldTx.accountId, -oldTx.amount);
    else if (oldTx.type === 'expense') await updateAccountBalance(oldTx.accountId, oldTx.amount);
    else if (oldTx.type === 'transfer' && oldTx.toAccountId) {
       await updateAccountBalance(oldTx.accountId, oldTx.amount);
       await updateAccountBalance(oldTx.toAccountId, -oldTx.amount);
    }

    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', oldTx.id));
    setShowTxDetail(null);
  };

  // --- Account Management ---
  const handleSaveAccount = async () => {
    if (!user || !editingAccount || !editingAccount.name) return;
    
    const payload = {
      name: editingAccount.name,
      bank: editingAccount.bank,
      type: editingAccount.type,
      balance: Number(editingAccount.balance),
      limit: editingAccount.limit ? Number(editingAccount.limit) : 0,
      totalDebt: editingAccount.totalDebt ? Number(editingAccount.totalDebt) : 0,
      color: getBankColor(editingAccount.bank)
    };

    if (isNewAccount) {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'accounts'), { ...payload, createdAt: serverTimestamp() });
    } else {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'accounts', editingAccount.id), payload);
    }
    setEditingAccount(null);
  };

  const handleDeleteAccount = async () => {
    if (!user || !editingAccount || isNewAccount) return;
    if (confirm('ลบบัญชีนี้? ประวัติรายการที่เกี่ยวข้องจะยังอยู่แต่ไม่มีชื่อบัญชี')) {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'accounts', editingAccount.id));
      setEditingAccount(null);
    }
  };

  // --- Stats & Views ---
  const availableMonths = useMemo(() => Array.from(new Set(transactions.map(t => t.date.substring(0, 7)))).sort().reverse(), [transactions]);
  
  const filteredTx = useMemo(() => transactions.filter(t => 
    (!filterMonth || t.date.startsWith(filterMonth)) && 
    (filterType === 'all' || t.type === filterType)
  ), [transactions, filterMonth, filterType]);

  // Dashboard Stats
  const totalAssets = accounts.filter(a => a.type !== 'credit').reduce((sum, a) => sum + a.balance, 0);
  const totalDebt = accounts.reduce((sum, a) => sum + (a.totalDebt || 0), 0);
  const creditAvailable = accounts.filter(a => a.type === 'credit').reduce((sum, a) => sum + a.balance, 0);
  const creditLimitTotal = accounts.filter(a => a.type === 'credit').reduce((sum, a) => sum + (a.limit || 0), 0);
  const creditUsedReal = creditLimitTotal - creditAvailable;

  const WalletView = () => {
    // Sort by Bank Name then Name
    const sorted = [...accounts].sort((a, b) => a.bank.localeCompare(b.bank) || a.name.localeCompare(b.name));
    // Group
    const grouped = sorted.reduce((g, a) => {
      (g[a.bank] = g[a.bank] || []).push(a);
      return g;
    }, {} as Record<string, Account[]>);

    return (
      <div className="pb-24 pt-4 space-y-6">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-2xl font-bold">กระเป๋าตังค์</h2>
          <button onClick={() => { setIsNewAccount(true); setEditingAccount({ id: '', name: '', bank: '', type: 'bank', balance: 0, color: 'from-slate-700 to-slate-900' }); }} className="bg-slate-900 text-white p-2 rounded-full shadow-lg"><Plus size={20}/></button>
        </div>
        
        {Object.entries(grouped).map(([bank, accs]) => (
          <div key={bank}>
            <h3 className="text-sm font-bold text-slate-500 mb-2 px-1 sticky top-0 bg-slate-100 py-1 z-10">{bank}</h3>
            <div className="space-y-3">
              {accs.map(acc => (
                <AccountCard key={acc.id} account={acc} onClick={() => { setIsNewAccount(false); setEditingAccount(acc); }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const SettingsView = () => (
    <div className="pt-4 px-1">
      <h2 className="text-2xl font-bold mb-6">ตั้งค่า</h2>
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
        <button onClick={() => setShowImport(true)} className="w-full p-4 border-b border-slate-50 flex items-center gap-4 hover:bg-slate-50 text-left">
           <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600"><Upload size={20}/></div>
           <div><p className="font-bold text-slate-800">นำเข้า CSV</p><p className="text-xs text-slate-400">Life-Balance2.csv</p></div>
        </button>
        <button onClick={handleLogout} className="w-full p-4 flex items-center gap-4 hover:bg-slate-50 text-left">
           <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-600"><LogOut size={20}/></div>
           <div><p className="font-bold text-slate-800">ออกจากระบบ</p><p className="text-xs text-slate-400">{user?.email || 'Anonymous'}</p></div>
        </button>
      </div>
    </div>
  );

  if (loading || authLoading) return <div className="h-screen flex items-center justify-center text-slate-400">Loading...</div>;
  if (!user) return (
    <div className="h-screen flex flex-col items-center justify-center p-6 bg-slate-900 text-white text-center">
      <Wallet size={64} className="mb-6 text-blue-400" />
      <h1 className="text-3xl font-bold mb-2">Credit Manager</h1>
      <p className="text-slate-400 mb-8">จัดการการเงินของคุณได้ง่ายๆ</p>
      <button onClick={handleLogin} className="bg-white text-slate-900 px-8 py-3 rounded-full font-bold">เข้าสู่ระบบด้วย Google</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 flex justify-center">
      <div className="w-full max-w-md bg-white sm:my-8 sm:rounded-[2.5rem] sm:shadow-2xl sm:border-[8px] sm:border-slate-800 flex flex-col relative overflow-hidden h-[100dvh] sm:h-[850px]">
        
        {/* Header */}
        <div className="px-6 pt-12 pb-2 bg-white flex justify-between items-center shrink-0 z-20">
           <div><p className="text-[10px] text-slate-400 uppercase">My Wallet</p><p className="font-bold text-lg">Dashboard</p></div>
           <button onClick={() => setActiveTab('settings')} className="p-2 bg-slate-50 rounded-full text-slate-600"><Settings size={20}/></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 hide-scrollbar bg-white relative z-10">
           {activeTab === 'dashboard' && (
             <div className="pb-24 space-y-6">
                <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl">
                   <p className="text-xs text-slate-400 mb-1">ความมั่งคั่งสุทธิ (Assets - Debt)</p>
                   <h1 className="text-4xl font-bold">{formatCurrency(totalAssets - totalDebt - creditUsedReal)}</h1>
                   <div className="grid grid-cols-2 gap-4 mt-6">
                      <div className="bg-white/10 p-3 rounded-xl border border-white/5">
                         <p className="text-[10px] text-emerald-300 flex items-center gap-1"><TrendingUp size={10}/> สินทรัพย์</p>
                         <p className="text-lg font-bold">{formatCurrency(totalAssets)}</p>
                      </div>
                      <div className="bg-white/10 p-3 rounded-xl border border-white/5">
                         <p className="text-[10px] text-rose-300 flex items-center gap-1"><CreditCard size={10}/> หนี้บัตร+ภาระ</p>
                         <p className="text-lg font-bold">{formatCurrency(creditUsedReal + totalDebt)}</p>
                      </div>
                   </div>
                </div>
                {/* Recent Tx List Reuse */}
                <div>
                  <div className="flex justify-between items-center mb-3"><h3 className="font-bold">ล่าสุด</h3><button onClick={() => setActiveTab('transactions')} className="text-xs text-blue-600">ดูทั้งหมด</button></div>
                  <div className="space-y-2">
                    {transactions.slice(0, 3).map(tx => (
                      <div key={tx.id} className="bg-white p-3 border rounded-xl flex justify-between items-center">
                         <div className="flex gap-3 items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.type==='income'?'bg-emerald-100 text-emerald-600':'bg-rose-50 text-rose-500'}`}>
                              {tx.type === 'income' ? <TrendingUp size={14}/> : <DollarSign size={14}/>}
                            </div>
                            <div><p className="text-sm font-bold">{tx.description}</p><p className="text-[10px] text-slate-400">{formatDate(tx.date)}</p></div>
                         </div>
                         <span className={`font-bold text-sm ${tx.type==='income'?'text-emerald-600':'text-slate-900'}`}>{formatCurrency(tx.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
             </div>
           )}
           {activeTab === 'wallet' && <WalletView />}
           {activeTab === 'transactions' && (
             <div className="pb-24 pt-4 h-full flex flex-col">
                <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                   <select className="bg-white border rounded-lg text-xs p-2" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
                      <option value="">ทุกเดือน</option>
                      {availableMonths.map(m => <option key={m} value={m}>{getThaiMonthName(m+'-01')}</option>)}
                   </select>
                   <select className="bg-white border rounded-lg text-xs p-2" value={filterType} onChange={e => setFilterType(e.target.value)}>
                      <option value="all">ทุกประเภท</option>
                      <option value="expense">รายจ่าย</option>
                      <option value="income">รายรับ</option>
                   </select>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2">
                   {filteredTx.map(tx => (
                     <div key={tx.id} onClick={() => { setNewTx(tx); setShowTxDetail(tx); }} className="bg-white p-4 border rounded-xl flex justify-between items-center cursor-pointer active:bg-slate-50">
                        <div className="flex gap-3 items-center">
                           <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.type==='income'?'bg-emerald-100 text-emerald-600': tx.type==='transfer'?'bg-blue-100 text-blue-600':'bg-rose-50 text-rose-500'}`}>
                              {tx.type==='income'?<TrendingUp size={18}/>:tx.type==='transfer'?<ArrowRightLeft size={18}/>:<DollarSign size={18}/>}
                           </div>
                           <div className="min-w-0">
                              <p className="font-bold text-sm truncate w-40">{tx.description}</p>
                              <p className="text-[10px] text-slate-400">{formatDate(tx.date)} • {accounts.find(a=>a.id===tx.accountId)?.name}</p>
                           </div>
                        </div>
                        <div className="text-right">
                           <p className={`font-bold ${tx.type==='income'?'text-emerald-600':'text-slate-900'}`}>{tx.type==='expense'?'-':''}{formatCurrency(tx.amount)}</p>
                           {tx.status==='unpaid' && <span className="text-[9px] bg-amber-100 text-amber-600 px-1 rounded">รอจ่าย</span>}
                        </div>
                     </div>
                   ))}
                </div>
             </div>
           )}
           {activeTab === 'settings' && <SettingsView />}
        </div>

        {/* Bottom Nav */}
        <div className="bg-white/90 backdrop-blur-md border-t py-3 px-6 flex justify-between items-center shrink-0 z-20 pb-6 sm:pb-3">
           <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 ${activeTab==='dashboard'?'text-slate-900':'text-slate-400'}`}><LayoutDashboard size={24}/><span className="text-[10px]">ภาพรวม</span></button>
           <button onClick={() => setActiveTab('wallet')} className={`flex flex-col items-center gap-1 ${activeTab==='wallet'?'text-slate-900':'text-slate-400'}`}><Wallet size={24}/><span className="text-[10px]">กระเป๋า</span></button>
           <div className="relative -top-6"><button onClick={() => { 
             setNewTx({ type: 'expense', amount: 0, date: new Date().toISOString().split('T')[0], category: 'ทั่วไป', status: 'unpaid' }); 
             setShowAddTx(true); 
           }} className="bg-slate-900 text-white w-14 h-14 rounded-full shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition border-4 border-white"><Plus size={28}/></button></div>
           <button onClick={() => setActiveTab('transactions')} className={`flex flex-col items-center gap-1 ${activeTab==='transactions'?'text-slate-900':'text-slate-400'}`}><List size={24}/><span className="text-[10px]">รายการ</span></button>
           <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 ${activeTab==='settings'?'text-slate-900':'text-slate-400'}`}><Settings size={24}/><span className="text-[10px]">ตั้งค่า</span></button>
        </div>

        {/* Add/Edit Transaction Modal */}
        {(showAddTx || showTxDetail) && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-end justify-center animate-fade-in">
             <div className="bg-white w-full h-[90%] rounded-t-3xl p-6 shadow-2xl relative animate-slide-up flex flex-col">
                <div className="flex justify-between items-center mb-4 shrink-0">
                   <h3 className="font-bold text-xl">{showTxDetail ? 'แก้ไขรายการ' : 'รายการใหม่'}</h3>
                   <button onClick={() => { setShowAddTx(false); setShowTxDetail(null); }} className="p-2 bg-slate-100 rounded-full text-slate-500"><XCircle size={24}/></button>
                </div>
                <div className="flex-1 overflow-y-auto">
                   <AddTxForm 
                     accounts={accounts} 
                     initialData={showTxDetail || newTx} 
                     isEdit={!!showTxDetail}
                     onSave={handleSaveTx}
                     onCancel={() => { setShowAddTx(false); setShowTxDetail(null); }}
                   />
                   {showTxDetail && (
                     <button onClick={handleDeleteTx} className="w-full mt-4 py-3 text-rose-500 font-bold bg-rose-50 rounded-xl flex items-center justify-center gap-2"><Trash2 size={18}/> ลบรายการนี้</button>
                   )}
                </div>
             </div>
          </div>
        )}

        {/* Add/Edit Account Modal */}
        {editingAccount && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-zoom-in">
                <h3 className="font-bold text-xl mb-4">{isNewAccount ? 'เพิ่มบัญชีใหม่' : 'แก้ไขบัญชี'}</h3>
                <div className="space-y-3">
                   <input type="text" placeholder="ชื่อบัญชี" className="w-full p-3 border rounded-xl" value={editingAccount.name} onChange={e => setEditingAccount({...editingAccount, name: e.target.value})}/>
                   <input type="text" placeholder="ธนาคาร (เช่น SCB)" className="w-full p-3 border rounded-xl" value={editingAccount.bank} onChange={e => setEditingAccount({...editingAccount, bank: e.target.value})}/>
                   <select className="w-full p-3 border rounded-xl bg-white" value={editingAccount.type} onChange={e => setEditingAccount({...editingAccount, type: e.target.value as any})}>
                      <option value="bank">บัญชีธนาคาร</option>
                      <option value="credit">บัตรเครดิต</option>
                      <option value="cash">เงินสด</option>
                   </select>
                   <div>
                     <label className="text-xs text-slate-400">{editingAccount.type === 'credit' ? 'วงเงินคงเหลือ (Available)' : 'ยอดเงินปัจจุบัน'}</label>
                     <input type="number" className="w-full p-3 border rounded-xl font-bold" value={editingAccount.balance} onChange={e => setEditingAccount({...editingAccount, balance: Number(e.target.value)})}/>
                   </div>
                   {editingAccount.type === 'credit' && (
                     <div>
                       <label className="text-xs text-slate-400">วงเงินทั้งหมด (Limit)</label>
                       <input type="number" className="w-full p-3 border rounded-xl" value={editingAccount.limit || 0} onChange={e => setEditingAccount({...editingAccount, limit: Number(e.target.value)})}/>
                     </div>
                   )}
                   <div className="pt-2 flex gap-2">
                      <button onClick={() => setEditingAccount(null)} className="flex-1 py-3 text-slate-500 bg-slate-100 rounded-xl">ยกเลิก</button>
                      <button onClick={handleSaveAccount} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold">บันทึก</button>
                   </div>
                   {!isNewAccount && <button onClick={handleDeleteAccount} className="w-full py-2 text-rose-500 text-xs mt-2">ลบบัญชีนี้</button>}
                </div>
             </div>
          </div>
        )}

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