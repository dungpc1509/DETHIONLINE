import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, 
  XCircle,
  ClipboardCheck, 
  GraduationCap,
  RotateCcw,
  Send,
  Trophy,
  ArrowLeft,
  Eye,
  Settings,
  Calculator,
  Save,
  CloudLightning,
  MonitorCheck
} from 'lucide-react';
import { 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  addDoc, 
  deleteDoc,
  getDocs,
  serverTimestamp, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { db } from './firebase';

// --- Types ---
type Section1Answer = 'A' | 'B' | 'C' | 'D' | null;
type Section2Answer = { a: boolean | null, b: boolean | null, c: boolean | null, d: boolean | null };
type Section3Answer = string;

interface ExamData {
  section1: Section1Answer[];
  section2: Section2Answer[];
  section3: Section3Answer[];
}

type AppRole = 'SELECT' | 'TEACHER' | 'STUDENT';

// --- Constants ---
const SECTION1_COUNT = 12;
const SECTION2_COUNT = 4;
const SECTION3_COUNT = 6;
const EXAM_ID = 'default-exam';

const S2_SCORING = {
  1: 0.1,
  2: 0.25,
  3: 0.5,
  4: 1.0
};

// --- Firebase Errors & Helpers ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: { userId: 'anonymous' }, 
    operationType,
    path
  };
  console.error('Firestore Error Log:', JSON.stringify(errInfo));
  return errInfo;
}

export default function App() {
  const [role, setRole] = useState<AppRole>('SELECT');
  const [examName, setExamName] = useState('Đề thi thử 2025');
  const [submissions, setSubmissions] = useState<{id: string, name: string, score: number, time: any}[]>([]);
  const [studentName, setStudentName] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [lastSubmissionError, setLastSubmissionError] = useState<string | null>(null);
  const [teacherPin, setTeacherPin] = useState('');
  const [isTeacherAuthenticated, setIsTeacherAuthenticated] = useState(false);
  const [showTeacherLogin, setShowTeacherLogin] = useState(false);
  
  const [keyData, setKeyData] = useState<ExamData>({
    section1: Array(SECTION1_COUNT).fill(null),
    section2: Array(SECTION2_COUNT).fill({ a: null, b: null, c: null, d: null }),
    section3: Array(SECTION3_COUNT).fill(''),
  });

  const [studentData, setStudentData] = useState<ExamData>({
    section1: Array(SECTION1_COUNT).fill(null),
    section2: Array(SECTION2_COUNT).fill({ a: null, b: null, c: null, d: null }),
    section3: Array(SECTION3_COUNT).fill(''),
  });

  useEffect(() => {
    const examDocPath = `exams/${EXAM_ID}`;
    const unsubExam = onSnapshot(doc(db, examDocPath), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setExamName(data.title || 'Đề thi thử 2025');
        if (data.keyData) setKeyData(data.keyData);
      }
      setIsInitialLoad(false);
      setConnectionError(null);
    }, (error) => {
      console.error("Exam Sync Error:", error);
      handleFirestoreError(error, OperationType.GET, examDocPath);
      setIsInitialLoad(false);
      setConnectionError("Không thể kết nối đến cơ sở dữ liệu. Vui lòng kiểm tra mạng.");
    });

    const subsColPath = `exams/${EXAM_ID}/submissions`;
    const q = query(collection(db, subsColPath), orderBy('submittedAt', 'desc'));
    const unsubSubs = onSnapshot(q, (snapshot) => {
      const subs = snapshot.docs.map(d => ({
        id: d.id,
        name: d.data().studentName,
        score: d.data().score,
        time: d.data().submittedAt
      }));
      setSubmissions(subs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, subsColPath);
    });

    return () => {
      unsubExam();
      unsubSubs();
    };
  }, []);

  const results = useMemo(() => {
    let s1Score = 0;
    let s2Score = 0;
    let s3Score = 0;

    const s1Details = studentData.section1.map((ans, i) => {
      const isCorrect = ans !== null && ans === keyData.section1[i];
      if (isCorrect) s1Score += 0.25;
      return isCorrect;
    });

    const s2Details = studentData.section2.map((ans, i) => {
      const key = keyData.section2[i];
      let correctParts = 0;
      const parts = {
        a: (ans.a !== null && key.a !== null) ? ans.a === key.a : false,
        b: (ans.b !== null && key.b !== null) ? ans.b === key.b : false,
        c: (ans.c !== null && key.c !== null) ? ans.c === key.c : false,
        d: (ans.d !== null && key.d !== null) ? ans.d === key.d : false,
      };
      if (parts.a) correctParts++;
      if (parts.b) correctParts++;
      if (parts.c) correctParts++;
      if (parts.d) correctParts++;
      const score = correctParts > 0 ? (S2_SCORING[correctParts as keyof typeof S2_SCORING] || 0) : 0;
      s2Score += score;
      return { parts, score };
    });

    const s3Details = studentData.section3.map((ans, i) => {
      if (!ans || !keyData.section3[i]) return false;
      const cleanAns = ans.trim().toLowerCase();
      const cleanKey = keyData.section3[i].trim().toLowerCase();
      const isCorrect = cleanKey !== '' && cleanAns === cleanKey;
      if (isCorrect) s3Score += 0.5;
      return isCorrect;
    });

    return {
      s1: Number(s1Score.toFixed(2)),
      s2: Number(s2Score.toFixed(2)),
      s3: Number(s3Score.toFixed(2)),
      total: Number((s1Score + s2Score + s3Score).toFixed(2)),
      details: { s1: s1Details, s2: s2Details, s3: s3Details }
    };
  }, [studentData, keyData]);

  const handleSaveExam = async () => {
    if (isSaving) return;
    setIsSaving(true);
    const path = `exams/${EXAM_ID}`;
    try {
      await setDoc(doc(db, path), {
        title: examName,
        keyData: keyData,
        updatedAt: serverTimestamp()
      });
      alert('Đề thi đã được lưu và đồng bộ thành công!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
      alert('Lỗi khi lưu đề thi. Vui lòng kiểm tra quyền truy cập.');
    } finally {
      setIsSaving(false);
    }
  };

  const submitPaper = async () => {
    if (isSubmitting) return;
    const trimmedName = studentName.trim();
    if (!trimmedName) {
      alert('Vui lòng nhập tên học sinh trước khi nộp!');
      return;
    }
    
    setIsSubmitting(true);
    setLastSubmissionError(null);
    const subsColPath = `exams/${EXAM_ID}/submissions`;
    
    try {
      console.log("Submitting paper...");
      const payload = {
        studentName: trimmedName,
        studentData: JSON.parse(JSON.stringify(studentData)), 
        score: results.total,
        submittedAt: serverTimestamp()
      };

      await addDoc(collection(db, subsColPath), payload);
      
      console.log("Submission successful!");
      setIsSubmitted(true);
      setShowSubmitConfirm(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error("Submission Failure:", err);
      const errInfo = handleFirestoreError(err, OperationType.CREATE, subsColPath);
      setLastSubmissionError(errInfo.error);
      alert(`NỘP BÀI THẤT BẠI: ${errInfo.error}. Vui lòng kiểm tra mạng.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleS1Change = (index: number, val: Section1Answer, isKey: boolean) => {
    const setter = isKey ? setKeyData : setStudentData;
    setter(prev => {
      const newData = [...prev.section1];
      newData[index] = val;
      return { ...prev, section1: newData };
    });
  };

  const handleS2Change = (index: number, part: 'a' | 'b' | 'c' | 'd', val: boolean | null, isKey: boolean) => {
    const setter = isKey ? setKeyData : setStudentData;
    setter(prev => {
      const newData = [...prev.section2];
      newData[index] = { ...newData[index], [part]: val };
      return { ...prev, section2: newData };
    });
  };

  const handleS3Change = (index: number, val: string, isKey: boolean) => {
    const setter = isKey ? setKeyData : setStudentData;
    setter(prev => {
      const newData = [...prev.section3];
      newData[index] = val;
      return { ...prev, section3: newData };
    });
  };

  const restartExam = () => {
    setStudentData({
      section1: Array(SECTION1_COUNT).fill(null),
      section2: Array(SECTION2_COUNT).fill({ a: null, b: null, c: null, d: null }),
      section3: Array(SECTION3_COUNT).fill(''),
    });
    setIsSubmitted(false);
    setHasStarted(false);
    setStudentName('');
  };

  const handleTeacherLogin = () => {
    if (teacherPin === '1509') {
      setIsTeacherAuthenticated(true);
      setRole('TEACHER');
      setShowTeacherLogin(false);
      setTeacherPin('');
    } else {
      alert('Mã PIN không chính xác!');
      setTeacherPin('');
    }
  };

  const handleDeleteStats = async () => {
    if (submissions.length === 0) return;
    if (!confirm('BẠN CÓ CHẮC CHẮN MUỐN XÓA TẤT CẢ DỮ LIỆU THỐNG KÊ?\nHành động này không thể hoàn tác.')) return;

    const subsColPath = `exams/${EXAM_ID}/submissions`;
    try {
      setIsSaving(true);
      const snapshot = await getDocs(collection(db, subsColPath));
      const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, subsColPath, d.id)));
      await Promise.all(deletePromises);
      alert('Đã xóa toàn bộ dữ liệu thống kê.');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, subsColPath);
      alert('Lỗi khi xóa dữ liệu.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isInitialLoad) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center">
        <MonitorCheck className="w-12 h-12 text-indigo-400 animate-pulse mb-4" />
        <p className="text-neutral-500 font-medium animate-pulse">Đang tải dữ liệu thi...</p>
      </div>
    );
  }

  if (role === 'SELECT') {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8">
          <button 
            onClick={() => setShowTeacherLogin(true)} 
            className="group bg-white p-12 rounded-3xl shadow-xl hover:border-indigo-500 border-2 border-transparent transition-all text-center flex flex-col items-center gap-6"
          >
            <div className="w-20 h-20 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform"><Settings className="w-10 h-10" /></div>
            <div><h2 className="text-2xl font-bold uppercase tracking-tight">GIÁO VIÊN</h2><p className="text-neutral-500 mt-2">Soạn đề & Quản lý</p></div>
          </button>
          
          <button onClick={() => setRole('STUDENT')} className="group bg-white p-12 rounded-3xl shadow-xl hover:border-emerald-500 border-2 border-transparent transition-all text-center flex flex-col items-center gap-6">
            <div className="w-20 h-20 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform"><GraduationCap className="w-10 h-10" /></div>
            <div><h2 className="text-2xl font-bold uppercase tracking-tight">HỌC SINH</h2><p className="text-neutral-500 mt-2">Vào làm bài thi</p></div>
          </button>
        </motion.div>

        {/* Teacher Login Modal */}
        <AnimatePresence>
          {showTeacherLogin && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
              <motion.div initial={{ y: 20 }} animate={{ y: 0 }} className="bg-white w-full max-w-sm rounded-[40px] p-10 text-center space-y-6 shadow-2xl">
                <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto"><Settings className="w-8 h-8" /></div>
                <div>
                  <h3 className="text-2xl font-black text-neutral-800">Xác thực Giáo viên</h3>
                  <p className="text-neutral-500 text-sm mt-2">Vui lòng nhập mật khẩu 4 số để tiếp tục</p>
                </div>
                <input 
                  type="password" 
                  maxLength={4}
                  value={teacherPin}
                  onChange={(e) => setTeacherPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="****"
                  className="w-full text-center text-4xl font-black tracking-[1em] py-4 bg-neutral-50 border-2 rounded-2xl focus:border-indigo-500 outline-none transition-all placeholder:tracking-normal placeholder:text-2xl"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleTeacherLogin()}
                />
                <div className="flex flex-col gap-3">
                  <button onClick={handleTeacherLogin} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg">ĐĂNG NHẬP</button>
                  <button onClick={() => { setShowTeacherLogin(false); setTeacherPin(''); }} className="w-full py-2 text-neutral-400 font-bold">Hủy bỏ</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans pb-12">
      {connectionError && (
        <div className="bg-red-600 text-white text-center py-2 text-xs font-bold animate-pulse">
          {connectionError}
        </div>
      )}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-neutral-200 py-4 px-6 md:px-12 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => { if (confirm('Quay lại?')) { setRole('SELECT'); restartExam(); } }} className="p-2 hover:bg-neutral-100 rounded-full transition-colors"><ArrowLeft className="w-5 h-5 text-neutral-500" /></button>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <ClipboardCheck className={`w-6 h-6 ${role === 'TEACHER' ? 'text-indigo-600' : 'text-emerald-600'}`} /> SmartExam 2025
          </h1>
        </div>
        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${role === 'TEACHER' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {role === 'TEACHER' ? 'Giáo viên' : 'Học sinh'}
        </span>
      </nav>

      <div className="max-w-5xl mx-auto px-4 mt-8 space-y-8">
        <AnimatePresence>
          {showStats && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-6 border-b flex items-center justify-between bg-indigo-50">
                  <div className="flex items-center gap-4">
                    <h3 className="text-xl font-bold text-indigo-800 flex items-center gap-2"><Trophy className="w-6 h-6" /> Thống kê ({submissions.length})</h3>
                    {submissions.length > 0 && (
                      <button 
                        onClick={handleDeleteStats}
                        className="text-[10px] bg-red-100 text-red-600 px-3 py-1.5 rounded-lg font-black hover:bg-red-200 transition-colors uppercase tracking-tight"
                      >
                        Xóa tất cả
                      </button>
                    )}
                  </div>
                  <button onClick={() => setShowStats(false)} className="p-2 hover:bg-white rounded-full transition-colors"><XCircle className="w-6 h-6 text-neutral-400" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  {submissions.length === 0 ? <div className="text-center py-12 text-neutral-400 italic">Chưa có dữ liệu</div> : (
                    <table className="w-full">
                      <thead><tr className="text-[10px] font-black uppercase tracking-widest text-neutral-400 border-b">
                        <th className="pb-4 text-left">Học sinh</th><th className="pb-4 text-left">Điểm</th><th className="pb-4 text-left">Thời gian</th>
                      </tr></thead>
                      <tbody className="divide-y">
                        {submissions.map((sub, i) => (
                          <tr key={i} className="hover:bg-neutral-50 transition-colors">
                            <td className="py-4 font-bold">{sub.name}</td>
                            <td className="py-4"><span className={`px-3 py-1 rounded-lg font-black ${sub.score >= 5 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{sub.score.toFixed(2)}</span></td>
                            <td className="py-4 text-xs text-neutral-400">{sub.time ? new Date(sub.time.seconds * 1000).toLocaleString('vi-VN') : '...'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {role === 'STUDENT' && !hasStarted && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-12 rounded-[40px] shadow-2xl flex flex-col items-center gap-8">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center"><ClipboardCheck className="w-10 h-10" /></div>
            <div className="text-center">
              <h2 className="text-4xl font-black text-neutral-800">{examName}</h2>
              <p className="text-neutral-500 mt-4">Vui lòng nhập tên để bắt đầu bài thi.</p>
            </div>
            <div className="w-full max-w-md space-y-4">
              <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Họ và tên..." className="w-full px-8 py-5 bg-neutral-50 border-2 rounded-3xl text-xl font-bold focus:border-emerald-500 outline-none text-center" />
              <button disabled={!studentName.trim()} onClick={() => setHasStarted(true)} className="w-full py-5 bg-emerald-600 text-white rounded-3xl text-xl font-black hover:bg-emerald-700 transition-all disabled:opacity-50">Bắt đầu ngay</button>
            </div>
          </motion.div>
        )}

        {(role === 'TEACHER' || hasStarted) && (
          <div className="space-y-8 pb-20">
            <div className={`p-6 bg-white rounded-3xl shadow-sm border flex flex-col md:flex-row justify-between items-center gap-6 ${isSubmitted ? 'ring-8 ring-emerald-500/10' : ''}`}>
              <div className="flex items-center gap-5 w-full">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${role === 'TEACHER' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
                  {isSubmitted ? <Trophy className="w-10 h-10" /> : role === 'TEACHER' ? <Settings className="w-10 h-10" /> : <Calculator className="w-10 h-10" />}
                </div>
                <div className="flex-1">
                  {role === 'TEACHER' ? (
                    <input type="text" value={examName} onChange={(e) => setExamName(e.target.value)} className="bg-transparent border-b-2 border-indigo-100 focus:border-indigo-600 outline-none text-2xl font-black text-neutral-800 w-full" />
                  ) : (
                    <>
                      <h2 className="text-2xl font-black">{isSubmitted ? 'Kết quả: ' + results.total.toFixed(2) : examName}</h2>
                      <p className="text-neutral-500 font-medium">Thí sinh: {studentName}</p>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                {role === 'TEACHER' && (
                  <>
                    <button 
                      onClick={() => { if (confirm('Quay lại màn hình chính? Dữ liệu chưa lưu sẽ bị mất.')) { setRole('SELECT'); restartExam(); } }}
                      className="flex items-center gap-2 px-4 py-3 bg-white border-2 border-neutral-100 text-neutral-500 font-bold rounded-2xl hover:bg-neutral-50 transition-all shadow-sm"
                    >
                      <ArrowLeft className="w-5 h-5" />
                      <span className="hidden sm:inline">Trang chủ</span>
                    </button>
                    <button onClick={() => setShowStats(true)} className="flex items-center gap-2 px-6 py-3 bg-white border-2 rounded-2xl font-bold"><Eye className="w-5 h-5" /> Thống kê</button>
                    <button onClick={handleSaveExam} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-100 transition-all">
                      <Save className={`w-5 h-5 ${isSaving ? 'animate-spin' : ''}`} /> {isSaving ? 'Đang lưu...' : 'Lưu đề thi'}
                    </button>
                  </>
                )}
                {role === 'STUDENT' && !isSubmitted && (
                  <button onClick={() => setShowSubmitConfirm(true)} className="flex items-center gap-2 px-10 py-3.5 bg-emerald-600 text-white font-black rounded-2xl hover:bg-emerald-700 transition-transform hover:-translate-y-1">
                    <Send className={`w-5 h-5 ${isSubmitting ? 'animate-pulse' : ''}`} /> {isSubmitting ? 'Đang nộp...' : 'Nộp bài'}
                  </button>
                )}
                {isSubmitted && <button onClick={restartExam} className="p-4 bg-neutral-100 rounded-2xl text-neutral-500"><RotateCcw /></button>}
              </div>
            </div>

            {/* Section 1 */}
            <section className="bg-white p-8 rounded-[32px] shadow-sm border relative overflow-hidden">
               <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/50 flex items-center justify-center -mr-8 -mt-8 font-black text-blue-100 text-4xl">1</div>
              <h2 className="text-xl font-black flex items-center justify-between mb-10"><span className="flex items-center gap-3"><span className="w-10 h-10 flex items-center justify-center bg-blue-100 text-blue-700 rounded-2xl rotate-3">1</span> Phần I: Trắc nghiệm</span></h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {(role === 'TEACHER' ? keyData : studentData).section1.map((ans, idx) => (
                  <div key={`s1-${idx}`} className={`p-5 rounded-3xl border-2 transition-all ${isSubmitted ? (results.details.s1[idx] ? 'border-emerald-200 bg-emerald-50/20' : 'border-red-200 bg-red-50/20') : 'border-neutral-50 bg-neutral-50/40'}`}>
                    <div className="flex justify-between items-center mb-4"><span className="text-sm font-black text-neutral-400">Câu {idx + 1}</span>{isSubmitted && (results.details.s1[idx] ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-red-500" />)}</div>
                    <div className="flex gap-1.5 justify-between">
                      {['A', 'B', 'C', 'D'].map((opt) => (
                        <button key={opt} disabled={isSubmitted} onClick={() => handleS1Change(idx, opt as any, role === 'TEACHER')} className={`w-11 h-11 rounded-xl border-2 text-sm font-black flex items-center justify-center transition-all ${ans === opt ? (isSubmitted ? (results.details.s1[idx] ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-red-500 border-red-500 text-white') : (role === 'TEACHER' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-emerald-600 border-emerald-600 text-white')) : (isSubmitted && keyData.section1[idx] === opt ? 'border-emerald-500 text-emerald-600 bg-white ring-2 ring-emerald-500/20' : 'border-neutral-200 text-neutral-400 bg-white')}`}>{opt}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 2 */}
            <section className="bg-white p-8 rounded-[32px] shadow-sm border relative overflow-hidden">
               <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50/50 flex items-center justify-center -mr-8 -mt-8 font-black text-emerald-100 text-4xl">2</div>
              <h2 className="text-xl font-black flex items-center justify-between mb-10"><span className="flex items-center gap-3"><span className="w-10 h-10 flex items-center justify-center bg-emerald-100 text-emerald-700 rounded-2xl -rotate-3">2</span> Phần II: Đúng/Sai</span></h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {(role === 'TEACHER' ? keyData : studentData).section2.map((ans, idx) => (
                  <div key={`s2-${idx}`} className={`p-8 rounded-[32px] border-2 transition-all ${isSubmitted ? 'border-neutral-100 bg-neutral-50/20' : 'border-neutral-50 bg-neutral-50/40'}`}>
                    <div className="flex justify-between items-center mb-8 pb-4 border-b"><span className="text-sm font-black text-neutral-400 uppercase">Câu {idx + 1}</span>{isSubmitted && <span className="bg-indigo-600 text-white px-4 py-1 rounded-full text-[10px] font-black">+{results.details.s2[idx].score} đ</span>}</div>
                    <div className="space-y-5">
                      {['a', 'b', 'c', 'd'].map((part) => (
                        <div key={part} className="flex items-center justify-between">
                          <span className="text-sm font-black text-neutral-800 uppercase">Ý {part})</span>
                          <div className="flex gap-2.5 items-center">
                            {['Đúng', 'Sai'].map((label) => {
                              const val = label === 'Đúng';
                              const isSelected = ans[part as keyof Section2Answer] === val;
                              const isCorrectPart = keyData.section2[idx][part as keyof Section2Answer] === val;
                              let btnClass = isSelected ? (role === 'TEACHER' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-emerald-600 border-emerald-600 text-white') : 'bg-white border-neutral-200 text-neutral-400';
                              if (isSubmitted) {
                                if (isSelected) btnClass = isCorrectPart ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-red-500 border-red-500 text-white';
                                else if (isCorrectPart) btnClass = 'border-emerald-500 text-emerald-600 ring-2 ring-emerald-500/20 bg-white';
                                else btnClass = 'opacity-30 pointer-events-none scale-95';
                              }
                              return <button key={label} disabled={isSubmitted} onClick={() => handleS2Change(idx, part as any, val, role === 'TEACHER')} className={`px-8 py-2.5 rounded-2xl text-[10px] font-black border-2 transition-all uppercase tracking-widest ${btnClass}`}>{label}</button>;
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 3 */}
            <section className="bg-white p-8 rounded-[32px] shadow-sm border relative overflow-hidden">
               <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50/50 flex items-center justify-center -mr-8 -mt-8 font-black text-amber-100 text-4xl">3</div>
              <h2 className="text-xl font-black flex items-center justify-between mb-10"><span className="flex items-center gap-3"><span className="w-10 h-10 flex items-center justify-center bg-amber-100 text-amber-700 rounded-2xl rotate-6">3</span> Phần III: Trả lời ngắn</span></h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {(role === 'TEACHER' ? keyData : studentData).section3.map((ans, idx) => (
                  <div key={`s3-${idx}`} className={`flex flex-col gap-4 p-6 rounded-3xl border-2 transition-all ${isSubmitted ? (results.details.s3[idx] ? 'border-emerald-100 bg-emerald-50/30' : 'border-red-100 bg-red-50/30') : 'border-neutral-50 bg-neutral-50/40'}`}>
                    <div className="flex justify-between items-center"><label className="text-[10px] font-black text-neutral-400 uppercase">Câu {idx + 1}</label>{isSubmitted && (results.details.s3[idx] ? <CheckCircle2 className="w-6 h-6 text-emerald-500" /> : <XCircle className="w-6 h-6 text-red-500" />)}</div>
                    <div className="relative">
                      <input disabled={isSubmitted} type="text" value={ans} onChange={(e) => handleS3Change(idx, e.target.value, role === 'TEACHER')} placeholder="Đáp án..." className={`w-full px-5 py-4 bg-white border-2 rounded-2xl text-base font-black outline-none transition-all ${isSubmitted ? (results.details.s3[idx] ? 'border-emerald-400 text-emerald-700' : 'border-red-400 text-red-700') : 'border-neutral-100 focus:border-amber-400'}`} />
                      <CloudLightning className={`absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-100 ${ans ? 'text-amber-300' : ''}`} />
                    </div>
                    {isSubmitted && !results.details.s3[idx] && <div className="text-xs text-emerald-600 font-bold bg-white/80 p-3 rounded-2xl border-2 border-emerald-100">Đáp án đúng: {keyData.section3[idx]}</div>}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
      
      {hasStarted && !isSubmitted && (
        <div className="fixed bottom-0 left-0 right-0 p-4 z-40">
           <div className="max-w-md mx-auto bg-neutral-900 text-white p-4 rounded-3xl shadow-2xl flex items-center justify-between border-t-4 border-emerald-500">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center font-bold text-emerald-400">?</div>
                 <div><p className="text-[10px] uppercase font-black text-neutral-400">Trạng thái</p><p className="text-sm font-bold">Đang làm bài...</p></div>
              </div>
              <button 
                disabled={isSubmitting} 
                onClick={() => setShowSubmitConfirm(true)} 
                className="bg-emerald-600 hover:bg-emerald-700 px-6 py-2.5 rounded-2xl font-black text-xs transition-colors"
              >
                {isSubmitting ? 'Đang nộp...' : 'Nộp bài ngay'}
              </button>
           </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      <AnimatePresence>
        {showSubmitConfirm && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl p-8 text-center space-y-6"
            >
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto">
                <Send className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-neutral-800">Xác nhận nộp bài?</h3>
                <p className="text-neutral-500 mt-2">Hệ thống sẽ ghi nhận điểm số của học sinh <span className="font-bold text-neutral-800">{studentName}</span>.</p>
              </div>

              {lastSubmissionError && (
                <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-xs font-bold border border-red-100 flex items-center gap-2">
                  <XCircle className="w-4 h-4 shrink-0" />
                  Lỗi: {lastSubmissionError}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <button 
                  disabled={isSubmitting}
                  onClick={submitPaper}
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <MonitorCheck className="animate-spin" /> : null}
                  {isSubmitting ? 'Đang gửi dữ liệu...' : 'ĐỒNG Ý NỘP BÀI'}
                </button>
                <button 
                  disabled={isSubmitting}
                  onClick={() => setShowSubmitConfirm(false)}
                  className="w-full py-4 text-neutral-400 font-bold hover:text-neutral-600 transition-all"
                >
                  Quay lại làm tiếp
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
