import React, { useEffect, useState, Suspense, lazy } from "react";
import { SettingsProvider } from "./components/SettingsContext";
import { Terminal, Github, Settings as SettingsIcon } from "lucide-react";
import { ToastProvider } from "./components/Toast";
import { LoadingSpinner } from "./components/Loading";

// P0 Performance Fix: Lazy load view components for code splitting
const CreateView = lazy(() =>
  import("./components/CreateView").then((m) => ({ default: m.CreateView }))
);
const ReadView = lazy(() => import("./components/ReadView").then((m) => ({ default: m.ReadView })));
const Settings = lazy(() => import("./components/Settings").then((m) => ({ default: m.Settings })));

const App: React.FC = () => {
  const [viewId, setViewId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    // Simple routing based on query parameter `id`
    // We avoid HashRouter because the key is stored in the hash
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) {
      setViewId(id);
    }
  }, []);

  return (
    <SettingsProvider>
      <ToastProvider>
        <a href="#main-content" className="skip-to-content">
          Skip to main content
        </a>
        <div className="min-h-screen bg-term-bg text-term-green font-mono p-4 sm:p-8 flex flex-col items-center">
          <div className="w-full max-w-5xl relative">
            {/* Terminal Header */}
            <header className="mb-8 border-b-2 border-term-green pb-4 flex items-center justify-between glow-border border-t-0 border-l-0 border-r-0 shadow-[0_10px_20px_-10px_rgba(51,255,0,0.2)]">
              <div className="flex items-center gap-3">
                <div className="bg-term-green text-black p-1" aria-hidden="true">
                  <Terminal size={24} strokeWidth={3} />
                </div>
                <div>
                  <h1 className="text-4xl font-bold leading-none tracking-tighter glow-text">
                    Volatile.sh
                    <span className="animate-blink" aria-hidden="true">
                      _
                    </span>
                  </h1>
                  <p className="text-xs opacity-85 tracking-widest">
                    ZERO DISK. ZERO LOGS. 100% RAM.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowSettings(true)}
                  className="text-term-green/60 hover:text-term-green transition-colors p-2 rounded border border-transparent hover:border-term-green/30 focus:outline-none focus:ring-2 focus:ring-term-green"
                  aria-label="Open settings"
                >
                  <SettingsIcon className="w-5 h-5" aria-hidden="true" />
                </button>
                <div
                  className="hidden sm:block text-right text-xs opacity-50"
                  aria-label="System status"
                >
                  <div>STATUS: ONLINE</div>
                  <div>ENCRYPTION: AES-GCM-256</div>
                </div>
              </div>
            </header>

            {/* Main Content Area */}
            <main
              id="main-content"
              className="border-2 border-term-green bg-term-panel glow-border relative overflow-hidden"
            >
              {/* Decorative Matrix/Grid Background inside panel */}
              <div
                className="absolute inset-0 opacity-5 pointer-events-none"
                aria-hidden="true"
                style={{
                  backgroundImage:
                    "linear-gradient(0deg, transparent 24%, rgba(51, 255, 0, .3) 25%, rgba(51, 255, 0, .3) 26%, transparent 27%, transparent 74%, rgba(51, 255, 0, .3) 75%, rgba(51, 255, 0, .3) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(51, 255, 0, .3) 25%, rgba(51, 255, 0, .3) 26%, transparent 27%, transparent 74%, rgba(51, 255, 0, .3) 75%, rgba(51, 255, 0, .3) 76%, transparent 77%, transparent)",
                  backgroundSize: "30px 30px",
                }}
              ></div>

              <div className="relative z-10 p-6 sm:p-10">
                <Suspense fallback={<LoadingSpinner size="lg" text="Loading..." />}>
                  {viewId ? <ReadView id={viewId} /> : <CreateView />}
                </Suspense>
              </div>
            </main>

            {/* Footer */}
            <footer className="mt-8 text-center text-xs opacity-40 flex flex-col items-center gap-2">
              <p>
                &gt; SYSTEM OUTPUT: VOLATILE_MEMORY_VAULT_V1.0 <br />
                &gt; ALL DATA IS EPHEMERAL. TRUST THE CODE, NOT THE SERVER.
              </p>
              <nav aria-label="Footer navigation" className="opacity-60">
                <a
                  href="/faq.html"
                  className="hover:text-term-green hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-term-green focus:ring-offset-2 focus:ring-offset-black rounded px-1"
                >
                  [ FAQ ]
                </a>{" "}
                ·{" "}
                <a
                  href="/docs.html"
                  className="hover:text-term-green hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-term-green focus:ring-offset-2 focus:ring-offset-black rounded px-1"
                >
                  [ DOCS ]
                </a>{" "}
                ·{" "}
                <a
                  href="/security.html"
                  className="hover:text-term-green hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-term-green focus:ring-offset-2 focus:ring-offset-black rounded px-1"
                >
                  [ SECURITY ]
                </a>{" "}
                ·{" "}
                <a
                  href="/privacy.html"
                  className="hover:text-term-green hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-term-green focus:ring-offset-2 focus:ring-offset-black rounded px-1"
                >
                  [ PRIVACY ]
                </a>{" "}
                ·{" "}
                <a
                  href="/terms.html"
                  className="hover:text-term-green hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-term-green focus:ring-offset-2 focus:ring-offset-black rounded px-1"
                >
                  [ TERMS ]
                </a>
              </nav>
              <a
                href="https://github.com/7and1/volatile.sh"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 hover:text-term-green hover:opacity-100 transition-opacity mt-2 border-b border-transparent hover:border-term-green"
                aria-label="View source code on GitHub"
              >
                <Github size={12} aria-hidden="true" />[ SOURCE CODE / GITHUB ]
              </a>
            </footer>
          </div>

          {/* Settings Modal */}
          <Suspense fallback={null}>
            {showSettings && <Settings onClose={() => setShowSettings(false)} />}
          </Suspense>
        </div>
      </ToastProvider>
    </SettingsProvider>
  );
};

export default App;
