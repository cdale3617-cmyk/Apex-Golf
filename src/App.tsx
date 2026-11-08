import React, { useEffect, useState } from "react";
import { Briefcase, ClipboardList, Crosshair, House, UserRound } from "lucide-react";
import { Button, Seg, Toaster, toast } from "./ui";
import { useUnits } from "./units";
import { ProfileSheet } from "./components/ProfileSheet";
import Home from "./pages/Home";
import Play from "./pages/Play";
import Score from "./pages/Score";
import Bag from "./pages/Bag";

export type Tab = "home" | "play" | "score" | "bag";
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "home", label: "Home", icon: <House size={20} /> },
  { id: "play", label: "Play", icon: <Crosshair size={20} /> },
  { id: "score", label: "Score", icon: <ClipboardList size={20} /> },
  { id: "bag", label: "Bag", icon: <Briefcase size={20} /> },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [appearance,setAppearance]=useState(()=>localStorage.getItem('apex_appearance')==='night'?'night':'day');
  useEffect(()=>{document.documentElement.dataset.appearance=appearance;localStorage.setItem('apex_appearance',appearance);},[appearance]);
  const [profile, setProfile] = useState(false);
  const u = useUnits();
  const go = (t: Tab) => {
    setTab(t);
    localStorage.setItem("apex_tab", t);
  };

  useEffect(() => {
    const f = () => toast("Phone storage is full. Changes could not be saved. Free some space and try again.");
    window.addEventListener("apex-storage-full", f);
    return () => window.removeEventListener("apex-storage-full", f);
  }, []);

  return (
    <div className="app">
      <header className="top">
        <img src="apex-compass.svg" className="brand-icon" alt="Apex compass"/>
        <h1>
          APEX <span>Golf</span>
        </h1>
        <Seg value={u.unit} label="Distance unit" onChange={u.setUnit} options={[{ value: "m", label: "m" }, { value: "yd", label: "yd" }]} />
        <Button variant="ghost" size="icon" aria-label="Your game" onClick={() => setProfile(true)}>
          <UserRound size={20} />
        </Button>
      </header>
      <div className="appearance"><span>Anti-glare</span><Seg label="Anti-glare palette" value={appearance} onChange={setAppearance} options={[{value:'day',label:'Day'},{value:'night',label:'Night'}]}/></div>
      <main className={tab === "play" ? "fill" : undefined}>
        {tab === "home" ? <Home go={go} /> : null}
        {tab === "play" ? <Play go={go} /> : null}
        {tab === "score" ? <Score go={go} /> : null}
        {tab === "bag" ? <Bag /> : null}
      </main>
      <nav className="nav" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-current={tab === t.id} onClick={() => go(t.id)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
      <ProfileSheet open={profile} onClose={() => setProfile(false)} />
      <Toaster />
    </div>
  );
}
