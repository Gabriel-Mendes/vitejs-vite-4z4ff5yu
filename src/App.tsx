import { useState, useRef, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import { 
  Dumbbell, List, Plus, Image as ImageIcon, X, Timer, Activity, Play, 
  ChevronRight, Save, Copy, CheckCircle, Trash2, Edit2, Calendar, 
  Moon, Sun, BarChart2, CheckSquare, PlayCircle, Clock 
} from 'lucide-react';

// Importações do Firebase
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore';

// Sua configuração do Firebase
// @ts-ignore
const firebaseConfig = {
  apiKey: "AIzaSyC5S8UckXqCkAZvc70kUeFjZgjYepZ4jo0",
  authDomain: "calitracker-app.firebaseapp.com",
  projectId: "calitracker-app",
  storageBucket: "calitracker-app.firebasestorage.app",
  messagingSenderId: "465271718150",
  appId: "1:465271718150:web:6a4d4f31660a17280f5e87"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// @ts-ignore
const rawAppId = typeof __app_id !== 'undefined' ? String(__app_id) : 'meu-calitracker';
const appId = rawAppId.replace(/\//g, '-');

// --- TIPAGENS TYPESCRIPT RIGOROSAS ---
interface Exercise {
  id: string;
  name: string;
  muscle: string;
  type: string;
  difficulty: string; // Iniciante, Intermédio, Avançado
  equipment: string;  // Peso Corporal, Barra, Argolas, etc.
  image: string | null;
}

interface Routine {
  id: string;
  name: string;
  exercises: Exercise[];
}

interface WorkoutSet {
  value: number;
}

interface WorkoutItem {
  exerciseId: string;
  sets: WorkoutSet[];
}

interface WorkoutHistoryItem {
  date: string;
  items: WorkoutItem[];
}

const INITIAL_EXERCISES: Exercise[] = [
  { id: '1', name: 'Barra Fixa (Pull-up)', muscle: 'Costas', type: 'reps', difficulty: 'Intermédio', equipment: 'Barra Fixa', image: null },
  { id: '2', name: 'Flexão (Push-up)', muscle: 'Peito', type: 'reps', difficulty: 'Iniciante', equipment: 'Peso Corporal', image: null },
  { id: '3', name: 'Prancha', muscle: 'Abdômen', type: 'time', difficulty: 'Iniciante', equipment: 'Peso Corporal', image: null },
  { id: '4', name: 'Mergulho (Dips)', muscle: 'Tríceps', type: 'reps', difficulty: 'Intermédio', equipment: 'Paralelas', image: null },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'workout' | 'library' | 'stats'>('workout');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [currentWorkout, setCurrentWorkout] = useState<WorkoutItem[]>([]);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutHistoryItem[]>([]);
  
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('en-CA'));
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Funcionalidades Adicionais (Modo Escuro & Temporizador)
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [restTime, setRestTime] = useState<number>(0); // 0 significa inativo

  // Modais
  const [isAddExerciseModalOpen, setIsAddExerciseModalOpen] = useState<boolean>(false);
  const [isAddRoutineModalOpen, setIsAddRoutineModalOpen] = useState<boolean>(false);
  const [isLogExerciseModalOpen, setIsLogExerciseModalOpen] = useState<boolean>(false);
  const [selectedExerciseForLog, setSelectedExerciseForLog] = useState<Exercise | null>(null);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  // Inicializar Dark Mode (Persistência no localStorage)
  useEffect(() => {
    const savedTheme = localStorage.getItem('calitracker-theme');
    if (savedTheme === 'dark') setIsDarkMode(true);
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    localStorage.setItem('calitracker-theme', !isDarkMode ? 'dark' : 'light');
  };

  // Lógica do Temporizador de Descanso
  useEffect(() => {
    let timer: any;
    if (restTime > 0) {
      timer = setInterval(() => setRestTime((prev) => prev - 1), 1000);
    } else if (restTime === 0 && timer) {
      clearInterval(timer);
    }
    return () => clearInterval(timer);
  }, [restTime]);

  // Autenticação e Firebase Sync
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Erro na autenticação:", error);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);

    // Exercícios
    const exRef = collection(db, 'artifacts', appId, 'users', user.uid, 'exercises');
    const unsubEx = onSnapshot(exRef, (snap) => {
      if (snap.empty && exercises.length === 0) {
        INITIAL_EXERCISES.forEach(ex => setDoc(doc(exRef, ex.id), ex));
      } else {
        setExercises(snap.docs.map(d => d.data() as Exercise));
      }
    });

    // Rotinas
    const rtRef = collection(db, 'artifacts', appId, 'users', user.uid, 'routines');
    const unsubRt = onSnapshot(rtRef, (snap) => {
      setRoutines(snap.docs.map(d => d.data() as Routine));
    });

    // Histórico de Treinos (Para Estatísticas)
    const workRefAll = collection(db, 'artifacts', appId, 'users', user.uid, 'workouts');
    const unsubWorkAll = onSnapshot(workRefAll, (snap) => {
      setWorkoutHistory(snap.docs.map(d => ({ date: d.id, items: d.data().items as WorkoutItem[] })));
      
      // Encontrar o treino da data selecionada
      const todayDoc = snap.docs.find(d => d.id === selectedDate);
      setCurrentWorkout(todayDoc ? todayDoc.data().items as WorkoutItem[] : []);
      setIsLoading(false);
    });

    return () => { unsubEx(); unsubRt(); unsubWorkAll(); };
  }, [user, selectedDate]);

  // --- Handlers ---
  const handleSaveExercise = async (newEx: Exercise) => {
    if (!user) return;
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'exercises', newEx.id), newEx);
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    if (!user) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'exercises', exerciseId));
  };

  const handleSaveRoutine = async (routine: Routine) => {
    if (!user) return;
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'routines', routine.id), routine);
  };

  const handleLoadRoutine = async (routine: Routine) => {
    if (!user) return;
    const workRef = doc(db, 'artifacts', appId, 'users', user.uid, 'workouts', selectedDate);
    const newWorkoutItems = routine.exercises.map(ex => ({ exerciseId: ex.id, sets: [] }));
    await setDoc(workRef, { items: newWorkoutItems, date: selectedDate }, { merge: true });
    setActiveTab('workout');
  };

  const handleAddSet = async (exerciseId: string, valuesArray: number[], restSeconds: number) => {
    if (!user) return;
    const workRef = doc(db, 'artifacts', appId, 'users', user.uid, 'workouts', selectedDate);
    const updatedWorkout = [...currentWorkout];
    const exerciseIndex = updatedWorkout.findIndex(w => w.exerciseId === exerciseId);
    const newSets = valuesArray.map(v => ({ value: v }));
    
    if (exerciseIndex >= 0) {
      updatedWorkout[exerciseIndex].sets.push(...newSets);
    } else {
      updatedWorkout.push({ exerciseId, sets: newSets });
    }
    
    await setDoc(workRef, { items: updatedWorkout, date: selectedDate }, { merge: true });
    if (restSeconds > 0) setRestTime(restSeconds);
  };

  const handleRemoveWorkoutExercise = async (exerciseId: string) => {
    if (!user) return;
    const updatedWorkout = currentWorkout.filter(w => w.exerciseId !== exerciseId);
    const workRef = doc(db, 'artifacts', appId, 'users', user.uid, 'workouts', selectedDate);
    if (updatedWorkout.length === 0) await deleteDoc(workRef);
    else await setDoc(workRef, { items: updatedWorkout, date: selectedDate }, { merge: true });
  };

  const handleRemoveSet = async (exerciseId: string, setIndex: number) => {
    if (!user) return;
    let updatedWorkout = [...currentWorkout];
    const exIndex = updatedWorkout.findIndex(w => w.exerciseId === exerciseId);
    if (exIndex >= 0) {
      updatedWorkout[exIndex].sets.splice(setIndex, 1);
      if (updatedWorkout[exIndex].sets.length === 0) {
        updatedWorkout = updatedWorkout.filter(w => w.exerciseId !== exerciseId);
      }
    }
    const workRef = doc(db, 'artifacts', appId, 'users', user.uid, 'workouts', selectedDate);
    if (updatedWorkout.length === 0) await deleteDoc(workRef);
    else await setDoc(workRef, { items: updatedWorkout, date: selectedDate }, { merge: true });
  };

  // Tema CSS Central
  const themeClass = isDarkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900';

  return (
    <div className={`min-h-screen font-sans pb-24 selection:bg-emerald-500/30 transition-colors duration-300 ${themeClass}`}>
      {/* Header */}
      <header className={`p-4 shadow-md sticky top-0 z-20 transition-colors ${isDarkMode ? 'bg-slate-900 border-b border-slate-800' : 'bg-slate-900 text-white'}`}>
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Activity className="text-emerald-400" />
            <h1 className="text-xl font-bold tracking-tight">CaliTracker</h1>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={toggleDarkMode} className="text-slate-300 hover:text-white transition-colors">
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            {user && <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" title="Online (Nuvem)" />}
          </div>
        </div>
      </header>

      {/* Temporizador Flutuante */}
      {restTime > 0 && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-30 animate-in slide-in-from-top-4">
          <div className={`flex items-center gap-3 px-6 py-3 rounded-full shadow-lg border backdrop-blur-md font-bold
            ${isDarkMode ? 'bg-emerald-900/90 border-emerald-700 text-white' : 'bg-emerald-500/90 border-emerald-400 text-white'}`}>
            <Clock size={20} className="animate-pulse" />
            <span>Descanso: {Math.floor(restTime / 60)}:{(restTime % 60).toString().padStart(2, '0')}</span>
            <button onClick={() => setRestTime(0)} className="ml-2 bg-black/20 p-1 rounded-full hover:bg-black/40"><X size={16}/></button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-md mx-auto w-full p-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-emerald-500">
            <Activity size={48} className="animate-pulse" />
            <p className="mt-4 opacity-70 font-medium">Sincronizando...</p>
          </div>
        ) : (
          <>
            {activeTab === 'workout' && (
              <WorkoutView 
                exercises={exercises} routines={routines} currentWorkout={currentWorkout} 
                openLogModal={() => setIsLogExerciseModalOpen(true)} setSelectedExerciseForLog={setSelectedExerciseForLog}
                selectedDate={selectedDate} setSelectedDate={setSelectedDate}
                onRemoveExercise={handleRemoveWorkoutExercise} onRemoveSet={handleRemoveSet}
                onLoadRoutine={handleLoadRoutine} isDarkMode={isDarkMode}
              />
            )}
            {activeTab === 'library' && (
              <LibraryView 
                exercises={exercises} routines={routines}
                openAddModal={() => setIsAddExerciseModalOpen(true)} openRoutineModal={() => setIsAddRoutineModalOpen(true)}
                onDeleteExercise={handleDeleteExercise} 
                onEditExercise={(ex: Exercise) => {
                  setEditingExercise(ex);
                  setIsAddExerciseModalOpen(true);
                }}
                isDarkMode={isDarkMode}
              />
            )}
            {activeTab === 'stats' && (
              <StatsView exercises={exercises} history={workoutHistory} isDarkMode={isDarkMode} />
            )}
          </>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className={`fixed bottom-0 w-full border-t z-20 transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]'}`}>
        <div className="max-w-md mx-auto flex justify-between p-2 px-4">
          <NavBtn id="workout" current={activeTab} icon={Dumbbell} label="Treino" onClick={() => setActiveTab('workout')} isDark={isDarkMode} />
          <NavBtn id="library" current={activeTab} icon={List} label="Exercícios" onClick={() => setActiveTab('library')} isDark={isDarkMode} />
          <NavBtn id="stats" current={activeTab} icon={BarChart2} label="Estatísticas" onClick={() => setActiveTab('stats')} isDark={isDarkMode} />
        </div>
      </nav>

      {/* Modals */}
      {isAddExerciseModalOpen && (
        <AddExerciseModal 
          onClose={() => {
            setIsAddExerciseModalOpen(false);
            setEditingExercise(null);
          }} 
          onSave={handleSaveExercise} 
          isDark={isDarkMode} 
          initialData={editingExercise}
        />
      )}
      {isAddRoutineModalOpen && <AddRoutineModal exercises={exercises} onClose={() => setIsAddRoutineModalOpen(false)} onSave={handleSaveRoutine} isDark={isDarkMode} />}
      {isLogExerciseModalOpen && (
        <LogExerciseModal 
          exercises={exercises} selectedExercise={selectedExerciseForLog} setSelectedExercise={setSelectedExerciseForLog}
          onClose={() => { setIsLogExerciseModalOpen(false); setSelectedExerciseForLog(null); }}
          onAddSet={handleAddSet} isDark={isDarkMode}
          currentWorkout={currentWorkout}
        />
      )}
    </div>
  );
}

// --- NAVIGATION BUTTON COMPONENT ---
function NavBtn({ id, current, icon: Icon, label, onClick, isDark }: any) {
  const active = id === current;
  const darkClasses = active ? 'text-emerald-400 bg-emerald-950/50' : 'text-slate-500 hover:bg-slate-800';
  const lightClasses = active ? 'text-emerald-600 bg-emerald-50' : 'text-slate-500 hover:bg-slate-100';
  return (
    <button onClick={onClick} className={`flex flex-col items-center p-2 w-[30%] rounded-xl transition-colors ${isDark ? darkClasses : lightClasses}`}>
      <Icon size={24} />
      <span className="text-[10px] font-bold mt-1 uppercase tracking-wider">{label}</span>
    </button>
  );
}

// --- WORKOUT VIEW ---
interface WorkoutViewProps {
  exercises: Exercise[];
  routines: Routine[];
  currentWorkout: WorkoutItem[];
  openLogModal: () => void;
  setSelectedExerciseForLog: (ex: Exercise) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  onRemoveExercise: (id: string) => void;
  onRemoveSet: (exId: string, setIndex: number) => void;
  onLoadRoutine: (r: Routine) => void;
  isDarkMode: boolean;
}

function WorkoutView({ exercises, routines, currentWorkout, openLogModal, setSelectedExerciseForLog, selectedDate, setSelectedDate, onRemoveExercise, onRemoveSet, onLoadRoutine, isDarkMode }: WorkoutViewProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [isEditingWorkout, setIsEditingWorkout] = useState(false);
  const [showRoutineSelect, setShowRoutineSelect] = useState(false);

  const cardBg = isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100';
  const textTitle = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const textSub = isDarkMode ? 'text-slate-400' : 'text-slate-500';

  const handleExportWorkout = () => {
    const exportText = currentWorkout.map((item) => {
      const ex = exercises.find((e) => e.id === item.exerciseId);
      if (!ex) return '';
      const values = item.sets.map((s) => s.value).join('-');
      const unit = ex.type === 'time' ? ' seg' : '';
      return `${item.sets.length}x de ${values}${unit} de ${ex.name.toLowerCase()};`;
    }).join('\n');
    const textArea = document.createElement("textarea");
    textArea.value = exportText; document.body.appendChild(textArea); textArea.select();
    try { document.execCommand("copy"); setIsCopied(true); setTimeout(() => setIsCopied(false), 2500); } catch (err) {}
    document.body.removeChild(textArea);
  };

  if (showRoutineSelect) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setShowRoutineSelect(false)} className={`p-2 rounded-full ${isDarkMode ? 'bg-slate-800' : 'bg-slate-200'}`}><X size={20}/></button>
          <h2 className={`text-xl font-bold ${textTitle}`}>Carregar Rotina</h2>
        </div>
        {routines.length === 0 ? (
          <p className={textSub}>Não tem rotinas criadas. Crie-as no separador Exercícios.</p>
        ) : (
          routines.map(r => (
            <button key={r.id} onClick={() => { onLoadRoutine(r); setShowRoutineSelect(false); }}
              className={`w-full p-4 rounded-2xl text-left shadow-sm border transition-all ${cardBg} hover:border-emerald-500`}>
              <h3 className={`font-bold text-lg ${textTitle}`}>{r.name}</h3>
              <p className={`text-sm mt-1 ${textSub}`}>{r.exercises.length} exercícios</p>
            </button>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Seletor de Data */}
      <div className={`flex justify-between items-center p-3 rounded-2xl shadow-sm border ${cardBg}`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-emerald-900 text-emerald-400' : 'bg-emerald-100 text-emerald-600'}`}><Calendar size={20} /></div>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
            className={`bg-transparent font-bold outline-none cursor-pointer ${textTitle} [color-scheme:light] ${isDarkMode ? '[color-scheme:dark]' : ''}`} />
        </div>
        {currentWorkout.length > 0 && (
          <button onClick={() => setIsEditingWorkout(!isEditingWorkout)} 
            className={`p-2 rounded-full transition-colors active:scale-95 ${isEditingWorkout ? 'bg-amber-500/20 text-amber-500' : (isDarkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-400')}`}>
            <Edit2 size={20} />
          </button>
        )}
      </div>

      {currentWorkout.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[50vh] text-center space-y-4">
          <div className={`p-6 rounded-full ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}><Play className={isDarkMode ? 'text-slate-500' : 'text-slate-400'} size={48} /></div>
          <div>
            <h2 className={`text-xl font-bold ${textTitle}`}>Pronto para treinar?</h2>
            <p className={`mt-2 ${textSub}`}>Nenhum registo nesta data.</p>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setShowRoutineSelect(true)} className={`px-6 py-3 rounded-xl font-bold transition-transform active:scale-95 border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-700'}`}>
              Rotina Salva
            </button>
            <button onClick={openLogModal} className="bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-2">
              <Plus size={20} /> Iniciar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <h2 className={`text-2xl font-bold ${textTitle}`}>Resumo do Dia</h2>
            <div className="flex gap-2">
              <button onClick={handleExportWorkout} className={`p-2 rounded-full transition-colors active:scale-95 ${isCopied ? 'bg-emerald-500/20 text-emerald-500' : (isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-600')}`}>
                {isCopied ? <CheckCircle size={24} /> : <Copy size={24} />}
              </button>
              <button onClick={openLogModal} className={`p-2 rounded-full active:scale-95 ${isDarkMode ? 'bg-emerald-900 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
                <Plus size={24} />
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {currentWorkout.map((workoutItem, index) => {
              const exercise = exercises.find((e) => e.id === workoutItem.exerciseId);
              if (!exercise) return null;

              return (
                <div key={index} className={`rounded-2xl p-4 shadow-sm border transition-all ${isEditingWorkout ? (isDarkMode ? 'border-amber-700 shadow-amber-900/50' : 'border-amber-200 shadow-amber-100/50') : cardBg}`}>
                  <div className="flex items-center gap-4 mb-4">
                    {exercise.image ? (
                      <img src={exercise.image} alt={exercise.name} className={`w-12 h-12 rounded-lg object-cover ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`} />
                    ) : (
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400'}`}>
                        <Dumbbell size={24} />
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className={`font-bold ${textTitle}`}>{exercise.name}</h3>
                      <p className={`text-xs ${textSub}`}>{exercise.muscle}</p>
                    </div>
                    {isEditingWorkout && (
                      <button onClick={() => onRemoveExercise(exercise.id)} className="p-2 text-red-400 hover:bg-red-500/10 rounded-full"><Trash2 size={20} /></button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    {workoutItem.sets.map((set, setIdx) => (
                      <div key={setIdx} className={`border px-3 py-1.5 rounded-lg text-sm flex gap-2 items-center transition-colors 
                        ${isEditingWorkout ? (isDarkMode ? 'bg-red-950 border-red-900' : 'bg-red-50 border-red-100') : (isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100')}`}>
                        <span className={`text-xs font-bold ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{setIdx + 1}º</span>
                        <span className={`font-bold ${textTitle}`}>{set.value} {exercise.type === 'reps' ? 'reps' : 'seg'}</span>
                        {isEditingWorkout && (
                          <button onClick={() => onRemoveSet(exercise.id, setIdx)} className="ml-1 text-red-400 hover:text-red-300"><X size={16} /></button>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {!isEditingWorkout && (
                    <button onClick={() => { setSelectedExerciseForLog(exercise); openLogModal(); }}
                      className={`w-full py-2 text-sm font-medium rounded-lg transition-colors ${isDarkMode ? 'text-emerald-400 bg-emerald-950/30 hover:bg-emerald-900/50' : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'}`}>
                      + Registar Mais Séries
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// --- LIBRARY VIEW ---
interface LibraryViewProps {
  exercises: Exercise[];
  routines: Routine[];
  openAddModal: () => void;
  openRoutineModal: () => void;
  onDeleteExercise: (id: string) => void;
  onEditExercise: (ex: Exercise) => void;
  isDarkMode: boolean;
}

function LibraryView({ exercises, routines, openAddModal, openRoutineModal, onDeleteExercise, onEditExercise, isDarkMode }: LibraryViewProps) {
  const [libTab, setLibTab] = useState<'exercises'|'routines'>('exercises');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const cardBg = isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100';
  const textTitle = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const textSub = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const btnTag = isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600';

  const filteredEx = exercises.filter((e: Exercise) => filterDifficulty === 'all' || e.difficulty === filterDifficulty);

  const handleDeleteClick = (id: string) => {
    if (confirmDeleteId === id) { onDeleteExercise(id); setConfirmDeleteId(null); } 
    else { setConfirmDeleteId(id); setTimeout(() => setConfirmDeleteId(null), 3000); }
  };

  return (
    <div className="space-y-6">
      {/* Tabs Internas */}
      <div className={`flex p-1 rounded-xl ${isDarkMode ? 'bg-slate-900' : 'bg-slate-200'}`}>
        <button onClick={() => setLibTab('exercises')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${libTab === 'exercises' ? (isDarkMode ? 'bg-slate-800 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm') : 'text-slate-500'}`}>Exercícios</button>
        <button onClick={() => setLibTab('routines')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${libTab === 'routines' ? (isDarkMode ? 'bg-slate-800 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm') : 'text-slate-500'}`}>Rotinas</button>
      </div>

      {libTab === 'exercises' ? (
        <>
          {/* Filtros */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {['all', 'Iniciante', 'Intermédio', 'Avançado'].map(f => (
              <button key={f} onClick={() => setFilterDifficulty(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${filterDifficulty === f ? 'bg-emerald-500 text-white' : btnTag}`}>
                {f === 'all' ? 'Todos' : f}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 pb-8">
            {filteredEx.map((ex: Exercise) => (
              <div key={ex.id} className={`rounded-xl p-3 shadow-sm border flex items-center gap-4 ${cardBg}`}>
                {ex.image ? ( <img src={ex.image} alt={ex.name} className={`w-16 h-16 rounded-xl object-cover ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`} /> ) : (
                  <div className={`w-16 h-16 rounded-xl flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400'}`}><ImageIcon size={28} /></div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className={`font-bold text-lg leading-tight mb-1 truncate ${textTitle}`}>{ex.name}</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${btnTag}`}>{ex.muscle}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold border ${isDarkMode ? 'border-emerald-900 text-emerald-400' : 'border-emerald-200 text-emerald-600'}`}>{ex.difficulty}</span>
                    <span className={`text-xs flex items-center gap-1 ${textSub}`}>{ex.type === 'reps' ? <Dumbbell size={10}/> : <Timer size={10}/>}</span>
                  </div>
                </div>
                
                <button onClick={() => onEditExercise(ex)} className={`p-3 rounded-full transition-colors ${isDarkMode ? 'bg-slate-800 text-slate-400 hover:text-emerald-400' : 'bg-slate-50 text-slate-500 hover:text-emerald-600'}`}>
                  <Edit2 size={20} />
                </button>

                <button onClick={() => handleDeleteClick(ex.id)} className={`p-3 rounded-full transition-colors ${confirmDeleteId === ex.id ? 'bg-red-500/20 text-red-500' : (isDarkMode ? 'bg-slate-800 text-slate-500' : 'bg-slate-50 text-slate-400')}`}>
                  <Trash2 size={20} className={confirmDeleteId === ex.id ? 'animate-pulse' : ''} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={openAddModal} className="fixed bottom-24 right-4 bg-emerald-500 text-white p-4 rounded-full shadow-[0_4px_14px_0_rgba(16,185,129,0.39)] hover:bg-emerald-600 active:scale-95 transition-transform z-10"><Plus size={28} /></button>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3">
            {routines.map((r: Routine) => (
              <div key={r.id} className={`rounded-xl p-4 shadow-sm border ${cardBg}`}>
                <h3 className={`font-bold text-lg ${textTitle}`}>{r.name}</h3>
                <p className={`text-sm mt-1 mb-3 ${textSub}`}>{r.exercises.length} exercícios incluídos</p>
                <div className="flex flex-wrap gap-1">
                  {r.exercises.map(ex => <span key={ex.id} className={`text-[10px] px-2 py-1 rounded-md ${btnTag}`}>{ex.name}</span>)}
                </div>
              </div>
            ))}
            {routines.length === 0 && <p className={`text-center mt-10 ${textSub}`}>Ainda não criou nenhuma rotina.</p>}
          </div>
          <button onClick={openRoutineModal} className="fixed bottom-24 right-4 bg-emerald-500 text-white p-4 rounded-full shadow-[0_4px_14px_0_rgba(16,185,129,0.39)] hover:bg-emerald-600 active:scale-95 transition-transform z-10"><Plus size={28} /></button>
        </>
      )}
    </div>
  );
}

// --- STATS VIEW (Histórico, Prs e Heatmap) ---
function StatsView({ exercises, history, isDarkMode }: { exercises: Exercise[], history: WorkoutHistoryItem[], isDarkMode: boolean }) {
  const cardBg = isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100';
  const textTitle = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  
  // Calcular PRs
  const prs: Record<string, number> = {};
  history.forEach(day => {
    day.items.forEach(item => {
      const maxSet = Math.max(...item.sets.map(s => s.value), 0);
      if (!prs[item.exerciseId] || maxSet > prs[item.exerciseId]) {
        prs[item.exerciseId] = maxSet;
      }
    });
  });

  // Mapa de Calor (Últimos 28 dias)
  const heatmap = [];
  const today = new Date();
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-CA');
    const didWorkout = history.some(h => h.date === dateStr && h.items.length > 0);
    heatmap.push({ date: dateStr, active: didWorkout });
  }

  // Streak (Sequência de dias)
  let streak = 0;
  for (let i = 0; i < 300; i++) { // Olhar para trás até 300 dias
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-CA');
    const didWorkout = history.some(h => h.date === dateStr && h.items.length > 0);
    if (didWorkout) streak++;
    else if (i !== 0) break; // Ignorar se apenas hoje faltar, mas ontem teve. Quebra no primeiro dia sem treino no passado.
  }

  return (
    <div className="space-y-6">
      <h2 className={`text-2xl font-bold ${textTitle}`}>O Seu Progresso</h2>

      {/* Streak Box */}
      <div className={`p-6 rounded-3xl flex flex-col items-center justify-center border shadow-sm ${isDarkMode ? 'bg-emerald-950/20 border-emerald-900/50' : 'bg-emerald-50 border-emerald-100'}`}>
        <h3 className={`text-sm font-bold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-emerald-500' : 'text-emerald-700'}`}>Sequência Atual</h3>
        <div className="flex items-baseline gap-2">
          <span className={`text-6xl font-black ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>{streak}</span>
          <span className={`font-bold ${isDarkMode ? 'text-emerald-600' : 'text-emerald-800'}`}>Dias</span>
        </div>
      </div>

      {/* Calendário de Consistência (Heatmap) */}
      <div className={`p-4 rounded-2xl border shadow-sm ${cardBg}`}>
        <h3 className={`font-bold mb-4 ${textTitle}`}>Últimos 28 Dias</h3>
        <div className="grid grid-cols-7 gap-2">
          {heatmap.map((day, i) => (
            <div key={i} title={day.date} className={`aspect-square rounded-md transition-colors ${day.active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : (isDarkMode ? 'bg-slate-800' : 'bg-slate-100')}`} />
          ))}
        </div>
      </div>

      {/* Recordes Pessoais */}
      <div className={`p-4 rounded-2xl border shadow-sm ${cardBg}`}>
        <h3 className={`font-bold mb-4 ${textTitle}`}>Recordes Pessoais (Máx/Série)</h3>
        <div className="space-y-3">
          {Object.keys(prs).length === 0 ? (
            <p className={`text-sm ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Registe treinos para ver os seus PRs.</p>
          ) : (
            Object.entries(prs).map(([exId, val]) => {
              const ex = exercises.find(e => e.id === exId);
              if (!ex) return null;
              return (
                <div key={exId} className={`flex justify-between items-center p-3 rounded-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                  <span className={`font-medium ${textTitle}`}>{ex.name}</span>
                  <span className={`font-black text-lg px-3 py-1 rounded-lg ${isDarkMode ? 'bg-emerald-900/50 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
                    {val} <span className="text-xs font-bold uppercase">{ex.type === 'reps' ? 'Reps' : 'Seg'}</span>
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// --- MODALS ---

interface AddExerciseModalProps {
  onClose: () => void;
  onSave: (ex: Exercise) => void;
  isDark: boolean;
  initialData?: Exercise | null;
}

function AddExerciseModal({ onClose, onSave, isDark, initialData }: AddExerciseModalProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [muscle, setMuscle] = useState(initialData?.muscle || '');
  const [type, setType] = useState(initialData?.type || 'reps');
  const [difficulty, setDifficulty] = useState(initialData?.difficulty || 'Iniciante');
  const [equipment, setEquipment] = useState(initialData?.equipment || 'Peso Corporal');
  const [image, setImage] = useState<string | null>(initialData?.image || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const modalBg = isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-800';
  const inputBg = isDark ? 'bg-slate-950 border-slate-800 focus:border-emerald-500' : 'bg-slate-50 border-slate-200 focus:border-emerald-500';

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event: ProgressEvent<FileReader>) => {
        if (!event.target?.result) return;
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxW = 300; const scale = maxW / img.width;
          canvas.width = maxW; canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          setImage(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = event.target.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: initialData ? initialData.id : Date.now().toString(),
      name,
      muscle: muscle || 'Geral',
      type,
      difficulty,
      equipment,
      image
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className={`${modalBg} w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-8 max-h-[90vh] overflow-y-auto`}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">{initialData ? 'Editar Exercício' : 'Novo Exercício'}</h3>
          <button onClick={onClose} className={`p-2 rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}><X size={20}/></button>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2">
            <div onClick={() => fileInputRef.current?.click()} className={`w-24 h-24 rounded-2xl border-2 border-dashed flex items-center justify-center cursor-pointer overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-300'}`}>
              {image ? <img src={image} alt="Preview" className="w-full h-full object-cover" /> : <div className="flex flex-col items-center opacity-50"><ImageIcon size={24}/><span className="text-[10px] uppercase font-bold mt-1">Foto</span></div>}
            </div>
            <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
          </div>

          <div>
            <label className="block text-sm font-bold opacity-70 mb-1">Nome</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Muscle Up" className={`w-full p-3 rounded-xl border outline-none transition-all ${inputBg}`} />
          </div>

          <div className="grid grid-cols-2 gap-3">
             <div>
              <label className="block text-sm font-bold opacity-70 mb-1">Músculo</label>
              <input type="text" value={muscle} onChange={e => setMuscle(e.target.value)} placeholder="Ex: Costas" className={`w-full p-3 rounded-xl border outline-none transition-all ${inputBg}`} />
            </div>
            <div>
              <label className="block text-sm font-bold opacity-70 mb-1">Dificuldade</label>
              <select value={difficulty} onChange={e => setDifficulty(e.target.value)} className={`w-full p-3 rounded-xl border outline-none transition-all ${inputBg} appearance-none`}>
                <option>Iniciante</option><option>Intermédio</option><option>Avançado</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold opacity-70 mb-1">Equipamento</label>
            <select value={equipment} onChange={e => setEquipment(e.target.value)} className={`w-full p-3 rounded-xl border outline-none transition-all ${inputBg} appearance-none`}>
              <option>Peso Corporal</option><option>Barra Fixa</option><option>Argolas</option><option>Paralelas</option><option>Halteres</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold opacity-70 mb-2">Medição</label>
            <div className="flex gap-3">
              <button onClick={() => setType('reps')} className={`flex-1 p-3 rounded-xl border-2 font-bold flex justify-center items-center gap-2 transition-colors ${type === 'reps' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' : (isDark ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400')}`}><Dumbbell size={18}/> Reps</button>
              <button onClick={() => setType('time')} className={`flex-1 p-3 rounded-xl border-2 font-bold flex justify-center items-center gap-2 transition-colors ${type === 'time' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' : (isDark ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400')}`}><Timer size={18}/> Tempo</button>
            </div>
          </div>

          <button onClick={handleSave} disabled={!name.trim()} className="w-full mt-6 bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg disabled:opacity-50">Guardar Exercício</button>
        </div>
      </div>
    </div>
  );
}

function AddRoutineModal({ exercises, onClose, onSave, isDark }: any) {
  const [name, setName] = useState('');
  const [selectedEx, setSelectedEx] = useState<Exercise[]>([]);
  
  const modalBg = isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-800';
  const inputBg = isDark ? 'bg-slate-950 border-slate-800 focus:border-emerald-500' : 'bg-slate-50 border-slate-200 focus:border-emerald-500';

  const toggleEx = (ex: Exercise) => {
    if (selectedEx.find(e => e.id === ex.id)) setSelectedEx(selectedEx.filter(e => e.id !== ex.id));
    else setSelectedEx([...selectedEx, ex]);
  };

  const handleSave = () => {
    if (!name.trim() || selectedEx.length === 0) return;
    onSave({ id: Date.now().toString(), name, exercises: selectedEx });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className={`${modalBg} w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-8 h-[80vh] flex flex-col`}>
        <div className="flex justify-between items-center mb-4 shrink-0">
          <h3 className="text-xl font-bold">Criar Rotina</h3>
          <button onClick={onClose} className={`p-2 rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}><X size={20}/></button>
        </div>

        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nome (Ex: Treino A - Push)" className={`w-full p-4 font-bold text-lg rounded-xl border outline-none transition-all mb-4 shrink-0 ${inputBg}`} />
        
        <h4 className="font-bold text-sm opacity-70 mb-2">Selecione os Exercícios:</h4>
        <div className="flex-1 overflow-y-auto space-y-2 pb-4">
          {exercises.map((ex: Exercise) => {
            const isSelected = selectedEx.some(e => e.id === ex.id);
            return (
              <button key={ex.id} onClick={() => toggleEx(ex)} className={`w-full p-3 rounded-xl border flex items-center justify-between transition-colors ${isSelected ? 'border-emerald-500 bg-emerald-500/10' : (isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white')}`}>
                <span className="font-bold">{ex.name}</span>
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center ${isSelected ? 'border-emerald-500 bg-emerald-500 text-white' : (isDark ? 'border-slate-700' : 'border-slate-300')}`}>
                  {isSelected && <CheckSquare size={16}/>}
                </div>
              </button>
            )
          })}
        </div>
        <button onClick={handleSave} disabled={!name.trim() || selectedEx.length === 0} className="w-full mt-2 bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg disabled:opacity-50 shrink-0">Guardar Rotina</button>
      </div>
    </div>
  );
}

interface LogExerciseModalProps {
  exercises: Exercise[];
  selectedExercise: Exercise | null;
  setSelectedExercise: (ex: Exercise | null) => void;
  onClose: () => void;
  onAddSet: (exerciseId: string, valuesArray: number[], rest: number) => void;
  isDark: boolean;
  currentWorkout: WorkoutItem[];
}

function LogExerciseModal({ exercises, selectedExercise, setSelectedExercise, onClose, onAddSet, isDark, currentWorkout }: LogExerciseModalProps) {
  const [value, setValue] = useState('');
  const [rest, setRest] = useState<number>(0); // 0 = Sem descanso automático
  
  const modalBg = isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-800';

  const currentItem = currentWorkout.find(w => w.exerciseId === selectedExercise?.id);
  const loggedSets = currentItem?.sets || [];

  // Auto-preencher com o último valor registado e mostrar histórico
  useEffect(() => {
    if (selectedExercise && loggedSets.length > 0) {
      setValue(loggedSets[loggedSets.length - 1].value.toString());
    } else {
      setValue('');
    }
  }, [selectedExercise?.id]);

  const handleSaveSet = () => {
    if (!value.trim() || !selectedExercise) return;
    const cleanedString = value.replace(/[\s,xX]+/g, '-');
    const valuesArray = cleanedString.split('-').map(p => Number(p)).filter(n => !isNaN(n) && n > 0);
    if (valuesArray.length === 0) return;
    onAddSet(selectedExercise.id, valuesArray, rest);
    setValue(''); onClose(); 
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className={`${modalBg} w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl h-[85vh] sm:h-auto sm:max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-8`}>
        <div className={`p-4 border-b flex justify-between items-center shrink-0 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
          <h3 className="text-xl font-bold">{selectedExercise ? 'Registar Séries' : 'Escolha um Exercício'}</h3>
          <button onClick={onClose} className={`p-2 rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}><X size={20}/></button>
        </div>

        <div className={`flex-1 overflow-y-auto p-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
          {!selectedExercise ? (
            <div className="space-y-2 pb-8">
              {exercises.map((ex: Exercise) => (
                <button key={ex.id} onClick={() => setSelectedExercise(ex)} className={`w-full p-3 rounded-xl shadow-sm border flex items-center gap-4 text-left transition-colors ${isDark ? 'bg-slate-900 border-slate-800 hover:border-emerald-500' : 'bg-white border-slate-100 hover:border-emerald-300'}`}>
                   {ex.image ? <img src={ex.image} alt={ex.name} className={`w-12 h-12 rounded-lg object-cover ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`} /> : <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400'}`}><Dumbbell size={20} /></div>}
                  <div className="flex-1"><h4 className="font-bold text-lg">{ex.name}</h4><p className="text-xs opacity-70">{ex.muscle}</p></div>
                  <ChevronRight className="opacity-30" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-start mt-4 h-full space-y-6 pb-8">
              <div className="text-center w-full">
                <h2 className="text-3xl font-black">{selectedExercise.name}</h2>
                <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>{selectedExercise.muscle}</span>
              </div>

              {/* Mostrar as séries já feitas neste exercício hoje */}
              {loggedSets.length > 0 && (
                <div className={`w-full p-4 rounded-2xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <p className="text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Séries Registadas Hoje</p>
                  <div className="flex flex-wrap gap-2">
                    {loggedSets.map((s, i) => (
                      <span key={i} className={`px-2 py-1 rounded-md text-sm font-bold border ${isDark ? 'bg-slate-900 border-slate-700 text-emerald-400' : 'bg-slate-50 border-slate-200 text-emerald-600'}`}>
                        {i + 1}º: {s.value}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className={`w-full p-6 rounded-3xl shadow-sm border flex flex-col items-center ${loggedSets.length > 0 ? 'mt-0' : 'mt-4'} ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <label className="text-sm font-bold opacity-50 uppercase tracking-widest mb-2 text-center">Séries Executadas ({selectedExercise.type === 'reps' ? 'Reps' : 'Seg'})</label>
                <p className="text-xs text-slate-500 mb-6 text-center leading-relaxed">
                  Digite as séries separadas por hífen.<br/>
                  Exemplo: <strong className="text-emerald-500">8-7-6</strong> ou apenas <strong className="text-emerald-500">10</strong>
                </p>
                <input type="text" inputMode="text" value={value} onChange={(e) => setValue(e.target.value.replace(/ /g, '-'))} placeholder="Ex: 8-7-6" className={`w-full max-w-[200px] text-center text-4xl font-black text-emerald-500 outline-none border-2 rounded-2xl p-4 focus:border-emerald-500 transition-all shadow-inner ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-100 focus:bg-white'}`} autoFocus />
              </div>

              {/* Opções de Descanso */}
              <div className="w-full">
                <label className="block text-center text-sm font-bold opacity-50 uppercase mb-3">Temporizador de Descanso</label>
                <div className="flex gap-2 justify-center">
                  {[0, 60, 90, 120].map(secs => (
                    <button key={secs} onClick={() => setRest(secs)} className={`px-4 py-2 rounded-xl font-bold transition-colors border ${rest === secs ? 'bg-emerald-500 text-white border-emerald-500 shadow-md' : (isDark ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-white border-slate-200 text-slate-500')}`}>
                      {secs === 0 ? 'Nenhum' : `${secs}s`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 w-full mt-auto">
                <button onClick={() => setSelectedExercise(null)} className={`flex-1 py-4 font-bold rounded-xl transition-colors ${isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}>Voltar</button>
                <button onClick={handleSaveSet} disabled={!value.trim()} className="flex-[2] py-4 bg-emerald-500 text-white font-bold rounded-xl shadow-[0_4px_14px_0_rgba(16,185,129,0.39)] hover:bg-emerald-600 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"><Save size={20}/> Guardar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
