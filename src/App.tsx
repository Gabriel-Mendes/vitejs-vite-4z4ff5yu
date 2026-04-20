import { useState, useRef, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import { Dumbbell, List, Plus, Image as ImageIcon, X, Timer, Activity, Play, ChevronRight, Save, Copy, CheckCircle, Trash2, Edit2, Calendar } from 'lucide-react';

// Importações do Firebase
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore';

// Sua configuração do Firebase (Limpa e direta)
const firebaseConfig = {
  apiKey: "AIzaSyC5S8UckXqCkAZvc70kUeFjZgjYepZ4jo0",
  authDomain: "calitracker-app.firebaseapp.com",
  projectId: "calitracker-app",
  storageBucket: "calitracker-app.firebasestorage.app",
  messagingSenderId: "465271718150",
  appId: "1:465271718150:web:6a4d4f31660a17280f5e87"
};

// Inicialização
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'meu-calitracker';

// --- TIPAGENS TYPESCRIPT RIGOROSAS ---
interface Exercise {
  id: string;
  name: string;
  muscle: string;
  type: string;
  image: string | null;
}

interface WorkoutSet {
  value: number;
}

interface WorkoutItem {
  exerciseId: string;
  sets: WorkoutSet[];
}

// Dados iniciais (salvos na nuvem no primeiro acesso)
const INITIAL_EXERCISES: Exercise[] = [
  { id: '1', name: 'Barra Fixa (Pull-up)', muscle: 'Costas', type: 'reps', image: null },
  { id: '2', name: 'Flexão (Push-up)', muscle: 'Peito', type: 'reps', image: null },
  { id: '3', name: 'Prancha', muscle: 'Abdômen', type: 'time', image: null },
  { id: '4', name: 'Mergulho (Dips)', muscle: 'Tríceps', type: 'reps', image: null },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'workout' | 'library'>('workout');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [currentWorkout, setCurrentWorkout] = useState<WorkoutItem[]>([]);
  
  // Data Selecionada (Padrão: Hoje)
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('en-CA'));

  // Estado da Nuvem/Autenticação
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Estados para Modais
  const [isAddExerciseModalOpen, setIsAddExerciseModalOpen] = useState<boolean>(false);
  const [isLogExerciseModalOpen, setIsLogExerciseModalOpen] = useState<boolean>(false);
  const [selectedExerciseForLog, setSelectedExerciseForLog] = useState<Exercise | null>(null);

  // 1. Iniciar Autenticação
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Erro na autenticação:", error);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 2. Buscar Dados do Firestore (Biblioteca e Treino da Data Selecionada)
  useEffect(() => {
    if (!user) return;

    // Escutar Exercícios
    const exRef = collection(db, 'artifacts', appId, 'users', user.uid, 'exercises');
    const unsubExercises = onSnapshot(exRef, (snap) => {
      if (snap.empty && exercises.length === 0) {
        INITIAL_EXERCISES.forEach(ex => {
          setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'exercises', ex.id), ex);
        });
      } else {
        const loadedEx = snap.docs.map(d => d.data() as Exercise);
        setExercises(loadedEx);
      }
    }, (error) => console.error("Erro ao buscar exercícios:", error));

    return () => unsubExercises();
  }, [user]);

  // Escutar Treino sempre que a data mudar
  useEffect(() => {
    if (!user) return;
    setIsLoading(true);

    const workRef = doc(db, 'artifacts', appId, 'users', user.uid, 'workouts', selectedDate);
    const unsubWorkout = onSnapshot(workRef, (snap) => {
      if (snap.exists()) {
        setCurrentWorkout(snap.data().items as WorkoutItem[] || []);
      } else {
        setCurrentWorkout([]);
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Erro ao buscar treino:", error);
      setIsLoading(false);
    });

    return () => unsubWorkout();
  }, [user, selectedDate]);

  // --- Handlers da Biblioteca ---
  const handleSaveExercise = async (newEx: Exercise) => {
    if (!user) return;
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'exercises', newEx.id), newEx);
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    if (!user) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'exercises', exerciseId));
  };

  // --- Handlers do Treino ---
  const handleAddSet = async (exerciseId: string, valuesArray: number[]) => {
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
  };

  const handleRemoveWorkoutExercise = async (exerciseId: string) => {
    if (!user) return;
    const updatedWorkout = currentWorkout.filter(w => w.exerciseId !== exerciseId);
    const workRef = doc(db, 'artifacts', appId, 'users', user.uid, 'workouts', selectedDate);
    
    if (updatedWorkout.length === 0) {
      await deleteDoc(workRef);
    } else {
      await setDoc(workRef, { items: updatedWorkout, date: selectedDate }, { merge: true });
    }
  };

  const handleRemoveSet = async (exerciseId: string, setIndex: number) => {
    if (!user) return;
    let updatedWorkout = [...currentWorkout];
    const exIndex = updatedWorkout.findIndex(w => w.exerciseId === exerciseId);
    
    if (exIndex >= 0) {
      updatedWorkout[exIndex].sets.splice(setIndex, 1);
      
      // Se não sobrou nenhuma série, remove o exercício inteiro
      if (updatedWorkout[exIndex].sets.length === 0) {
        updatedWorkout = updatedWorkout.filter(w => w.exerciseId !== exerciseId);
      }
    }
    
    const workRef = doc(db, 'artifacts', appId, 'users', user.uid, 'workouts', selectedDate);
    if (updatedWorkout.length === 0) {
      await deleteDoc(workRef);
    } else {
      await setDoc(workRef, { items: updatedWorkout, date: selectedDate }, { merge: true });
    }
  };

  // --- Navegação ---
  const renderTab = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-emerald-500">
          <Activity size={48} className="animate-pulse" />
          <p className="mt-4 text-slate-500 font-medium">Sincronizando...</p>
        </div>
      );
    }

    switch (activeTab) {
      case 'workout':
        return (
          <WorkoutView 
            exercises={exercises} 
            currentWorkout={currentWorkout} 
            openLogModal={() => setIsLogExerciseModalOpen(true)}
            setSelectedExerciseForLog={setSelectedExerciseForLog}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            onRemoveExercise={handleRemoveWorkoutExercise}
            onRemoveSet={handleRemoveSet}
          />
        );
      case 'library':
        return (
          <LibraryView 
            exercises={exercises} 
            openAddModal={() => setIsAddExerciseModalOpen(true)} 
            onDeleteExercise={handleDeleteExercise}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20 selection:bg-emerald-200">
      {/* Header */}
      <header className="bg-slate-900 text-white p-4 shadow-md sticky top-0 z-10">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="text-emerald-400" />
            <h1 className="text-xl font-bold tracking-tight">CaliTracker</h1>
          </div>
          {user && <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" title="Online (Nuvem)" />}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto w-full p-4">
        {renderTab()}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 w-full bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
        <div className="max-w-md mx-auto flex justify-around p-2">
          <button 
            onClick={() => setActiveTab('workout')}
            className={`flex flex-col items-center p-2 w-full rounded-xl transition-colors ${activeTab === 'workout' ? 'text-emerald-600 bg-emerald-50' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <Dumbbell size={24} />
            <span className="text-xs font-medium mt-1">Treino</span>
          </button>
          <button 
            onClick={() => setActiveTab('library')}
            className={`flex flex-col items-center p-2 w-full rounded-xl transition-colors ${activeTab === 'library' ? 'text-emerald-600 bg-emerald-50' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <List size={24} />
            <span className="text-xs font-medium mt-1">Exercícios</span>
          </button>
        </div>
      </nav>

      {/* Modals */}
      {isAddExerciseModalOpen && (
        <AddExerciseModal 
          onClose={() => setIsAddExerciseModalOpen(false)} 
          onSave={handleSaveExercise} 
        />
      )}

      {isLogExerciseModalOpen && (
        <LogExerciseModal 
          exercises={exercises}
          selectedExercise={selectedExerciseForLog}
          setSelectedExercise={setSelectedExerciseForLog}
          onClose={() => {
            setIsLogExerciseModalOpen(false);
            setSelectedExerciseForLog(null);
          }}
          onAddSet={handleAddSet}
        />
      )}
    </div>
  );
}

// --- VIEWS ---

interface WorkoutViewProps {
  exercises: Exercise[];
  currentWorkout: WorkoutItem[];
  openLogModal: () => void;
  setSelectedExerciseForLog: (ex: Exercise) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  onRemoveExercise: (id: string) => void;
  onRemoveSet: (exId: string, setIndex: number) => void;
}

function WorkoutView({ exercises, currentWorkout, openLogModal, setSelectedExerciseForLog, selectedDate, setSelectedDate, onRemoveExercise, onRemoveSet }: WorkoutViewProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [isEditingWorkout, setIsEditingWorkout] = useState(false);

  const handleExportWorkout = () => {
    const exportText = currentWorkout.map((item) => {
      const ex = exercises.find((e) => e.id === item.exerciseId);
      if (!ex) return '';
      
      const numSets = item.sets.length;
      const values = item.sets.map((s) => s.value).join('-');
      const unit = ex.type === 'time' ? ' seg' : '';
      
      return `${numSets}x de ${values}${unit} de ${ex.name.toLowerCase()};`;
    }).join('\n');

    const textArea = document.createElement("textarea");
    textArea.value = exportText;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand("copy");
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch (err) {
      console.error("Falha ao copiar", err);
    }
    document.body.removeChild(textArea);
  };

  return (
    <div className="space-y-6">
      
      {/* Seletor de Data e Controles */}
      <div className="flex justify-between items-center bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
            <Calendar size={20} />
          </div>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
          />
        </div>
        
        {currentWorkout.length > 0 && (
          <button 
            onClick={() => setIsEditingWorkout(!isEditingWorkout)} 
            className={`p-2 rounded-full transition-colors active:scale-95 ${isEditingWorkout ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
            title="Editar Treino"
          >
            <Edit2 size={20} />
          </button>
        )}
      </div>

      {currentWorkout.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[50vh] text-center space-y-4">
          <div className="bg-slate-100 p-6 rounded-full">
            <Play className="text-slate-400" size={48} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Pronto para treinar?</h2>
            <p className="text-slate-500 mt-2">Nenhum exercício registrado nesta data.</p>
          </div>
          <button 
            onClick={openLogModal}
            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-transform active:scale-95 flex items-center gap-2"
          >
            <Plus size={20} /> Registrar Treino
          </button>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-slate-800">Resumo do Dia</h2>
            <div className="flex gap-2">
              <button 
                onClick={handleExportWorkout}
                className={`p-2 rounded-full transition-colors ${isCopied ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'} active:scale-95`}
                title="Copiar Treino"
              >
                {isCopied ? <CheckCircle size={24} /> : <Copy size={24} />}
              </button>
              <button 
                onClick={openLogModal}
                className="bg-emerald-100 text-emerald-700 p-2 rounded-full hover:bg-emerald-200 active:scale-95"
              >
                <Plus size={24} />
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {currentWorkout.map((workoutItem, index) => {
              const exercise = exercises.find((e) => e.id === workoutItem.exerciseId);
              if (!exercise) return null;

              return (
                <div key={index} className={`bg-white rounded-2xl p-4 shadow-sm border transition-all ${isEditingWorkout ? 'border-amber-200 shadow-amber-100/50' : 'border-slate-100'}`}>
                  <div className="flex items-center gap-4 mb-4">
                    {exercise.image ? (
                      <img src={exercise.image} alt={exercise.name} className="w-12 h-12 rounded-lg object-cover bg-slate-100" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                        <Dumbbell size={24} />
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-800">{exercise.name}</h3>
                      <p className="text-xs text-slate-500">{exercise.muscle}</p>
                    </div>
                    {isEditingWorkout && (
                      <button 
                        onClick={() => onRemoveExercise(exercise.id)}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                      >
                        <Trash2 size={20} />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    {workoutItem.sets.map((set, setIdx) => (
                      <div key={setIdx} className={`border px-3 py-1.5 rounded-lg text-sm flex gap-2 items-center transition-colors ${isEditingWorkout ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                        <span className="text-slate-400 text-xs font-bold">{setIdx + 1}º</span>
                        <span className="font-bold text-slate-800">
                          {set.value} {exercise.type === 'reps' ? 'reps' : 'seg'}
                        </span>
                        {isEditingWorkout && (
                          <button 
                            onClick={() => onRemoveSet(exercise.id, setIdx)}
                            className="ml-1 text-red-500 bg-red-100 rounded-full p-0.5 hover:bg-red-200"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {!isEditingWorkout && (
                    <button 
                      onClick={() => {
                        setSelectedExerciseForLog(exercise);
                        openLogModal();
                      }}
                      className="w-full py-2 text-sm font-medium text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                    >
                      + Registrar Mais Séries
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

interface LibraryViewProps {
  exercises: Exercise[];
  openAddModal: () => void;
  onDeleteExercise: (id: string) => void;
}

function LibraryView({ exercises, openAddModal, onDeleteExercise }: LibraryViewProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDeleteClick = (id: string) => {
    if (confirmDeleteId === id) {
      onDeleteExercise(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      // Reseta a confirmação após 3 segundos
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Meus Exercícios</h2>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {exercises.map((exercise) => (
          <div key={exercise.id} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 flex items-center gap-4">
             {exercise.image ? (
                <img src={exercise.image} alt={exercise.name} className="w-16 h-16 rounded-xl object-cover bg-slate-100 shadow-sm" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                  <ImageIcon size={28} />
                </div>
              )}
            <div className="flex-1">
              <h3 className="font-bold text-slate-800 text-lg leading-tight mb-1">{exercise.name}</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-md font-medium">
                  {exercise.muscle}
                </span>
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  {exercise.type === 'reps' ? <Dumbbell size={12}/> : <Timer size={12}/>}
                  {exercise.type === 'reps' ? 'Reps' : 'Tempo'}
                </span>
              </div>
            </div>
            
            <button 
              onClick={() => handleDeleteClick(exercise.id)}
              className={`p-3 rounded-full transition-colors ${confirmDeleteId === exercise.id ? 'bg-red-100 text-red-600' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
              title={confirmDeleteId === exercise.id ? "Toque novamente para apagar" : "Apagar exercício"}
            >
              {confirmDeleteId === exercise.id ? <Trash2 size={20} className="animate-pulse" /> : <Trash2 size={20} />}
            </button>
          </div>
        ))}
      </div>

      <button 
        onClick={openAddModal}
        className="fixed bottom-24 right-4 bg-slate-900 text-white p-4 rounded-full shadow-xl hover:bg-slate-800 active:scale-95 transition-transform z-10 flex items-center justify-center"
      >
        <Plus size={28} />
      </button>
    </div>
  );
}

// --- MODALS ---

interface AddExerciseModalProps {
  onClose: () => void;
  onSave: (ex: Exercise) => void;
}

function AddExerciseModal({ onClose, onSave }: AddExerciseModalProps) {
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState('');
  const [type, setType] = useState('reps');
  const [image, setImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event: ProgressEvent<FileReader>) => {
        if (!event.target?.result) return;
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 300; 
          const scaleSize = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;
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
      id: Date.now().toString(),
      name,
      muscle: muscle || 'Geral',
      type,
      image
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-800">Novo Exercício</h3>
          <button onClick={onClose} className="bg-slate-100 p-2 rounded-full text-slate-500 hover:bg-slate-200"><X size={20}/></button>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-24 h-24 rounded-2xl bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-50 overflow-hidden relative"
            >
              {image ? (
                <img src={image} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center">
                  <ImageIcon size={24} className="mb-1"/>
                  <span className="text-[10px] uppercase font-bold tracking-wider">Foto</span>
                </div>
              )}
            </div>
            <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Nome do Exercício</label>
            <input 
              type="text" 
              placeholder="Ex: Muscle Up" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Grupo Muscular Principal</label>
            <input 
              type="text" 
              placeholder="Ex: Costas, Core..." 
              value={muscle}
              onChange={(e) => setMuscle(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">Como você mede?</label>
            <div className="flex gap-3">
              <button 
                onClick={() => setType('reps')}
                className={`flex-1 flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${type === 'reps' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-400 bg-transparent'}`}
              >
                <Dumbbell size={24} className="mb-1"/>
                <span className="font-bold text-sm">Repetições</span>
              </button>
              <button 
                onClick={() => setType('time')}
                className={`flex-1 flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${type === 'time' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-400 bg-transparent'}`}
              >
                <Timer size={24} className="mb-1"/>
                <span className="font-bold text-sm">Tempo (Seg)</span>
              </button>
            </div>
          </div>

          <button 
            onClick={handleSave}
            disabled={!name.trim()}
            className="w-full mt-6 bg-slate-900 text-white font-bold py-4 rounded-xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors"
          >
            Salvar Exercício
          </button>
        </div>
      </div>
    </div>
  );
}

interface LogExerciseModalProps {
  exercises: Exercise[];
  selectedExercise: Exercise | null;
  setSelectedExercise: (ex: Exercise | null) => void;
  onClose: () => void;
  onAddSet: (exerciseId: string, valuesArray: number[]) => void;
}

function LogExerciseModal({ exercises, selectedExercise, setSelectedExercise, onClose, onAddSet }: LogExerciseModalProps) {
  const [value, setValue] = useState('');

  const handleSaveSet = () => {
    if (!value.trim() || !selectedExercise) return;
    
    // Converte textos como "8-7-6" ou "10, 8, 6" em um array de números [8, 7, 6]
    const cleanedString = value.replace(/[\s,xX]+/g, '-');
    const parts = cleanedString.split('-').filter(p => p !== '');
    const valuesArray = parts.map(p => Number(p)).filter(n => !isNaN(n) && n > 0);
    
    if (valuesArray.length === 0) return;
    
    onAddSet(selectedExercise.id, valuesArray);
    setValue('');
    onClose(); 
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl h-[85vh] sm:h-auto sm:max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-8">
        
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white rounded-t-3xl sm:rounded-t-3xl shrink-0">
          <h3 className="text-xl font-bold text-slate-800">
            {selectedExercise ? 'Registrar Séries' : 'Escolha um Exercício'}
          </h3>
          <button onClick={onClose} className="bg-slate-100 p-2 rounded-full text-slate-500 hover:bg-slate-200"><X size={20}/></button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
          {!selectedExercise ? (
            <div className="space-y-2 pb-8">
              {exercises.map((exercise) => (
                <button 
                  key={exercise.id}
                  onClick={() => setSelectedExercise(exercise)}
                  className="w-full bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 hover:border-emerald-200 hover:shadow-md transition-all text-left"
                >
                   {exercise.image ? (
                    <img src={exercise.image} alt={exercise.name} className="w-12 h-12 rounded-lg object-cover bg-slate-100" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                      <Dumbbell size={20} />
                    </div>
                  )}
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-800 text-lg">{exercise.name}</h4>
                    <p className="text-xs text-slate-500">{exercise.muscle}</p>
                  </div>
                  <ChevronRight className="text-slate-300" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-start mt-4 h-full space-y-6 pb-8">
              {/* Info Exercício */}
              <div className="text-center w-full">
                <h2 className="text-3xl font-black text-slate-800">{selectedExercise.name}</h2>
                <span className="inline-block mt-2 px-3 py-1 bg-slate-200 text-slate-600 rounded-full text-xs font-bold uppercase tracking-wider">
                  {selectedExercise.muscle}
                </span>
              </div>

              {/* Input Dinâmico */}
              <div className="w-full bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col items-center mt-4">
                <label className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2 text-center">
                  Séries Executadas ({selectedExercise.type === 'reps' ? 'Reps' : 'Segundos'})
                </label>
                <p className="text-xs text-slate-500 mb-6 text-center leading-relaxed">
                  Digite as séries separadas por hífen.<br/>
                  Exemplo: <strong className="text-emerald-600">8-7-6</strong> ou apenas <strong className="text-emerald-600">10</strong>
                </p>
                
                <input 
                  type="text"
                  inputMode="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Ex: 8-7-6"
                  className="w-full max-w-[200px] text-center text-4xl font-black text-emerald-600 outline-none bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 focus:border-emerald-400 focus:bg-white transition-all shadow-inner"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 w-full mt-auto">
                <button 
                  onClick={() => setSelectedExercise(null)}
                  className="flex-1 py-4 text-slate-500 font-bold bg-slate-200 rounded-xl hover:bg-slate-300"
                >
                  Voltar
                </button>
                <button 
                  onClick={handleSaveSet}
                  disabled={!value.trim()}
                  className="flex-[2] py-4 bg-emerald-500 text-white font-bold rounded-xl shadow-lg hover:bg-emerald-600 active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save size={20}/> Salvar Séries
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
