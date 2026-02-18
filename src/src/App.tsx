import { useState, useEffect } from 'react';
import './App.css';
import { Sidebar } from './components/layout/Sidebar';
import { ContributionGraph } from './components/dashboard/ContributionGraph';
import { CoAuthorGenerator } from './components/labs/CoAuthorGenerator';
import { AddProfileDialog } from './components/profile/AddProfileDialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Check, Fingerprint, Pencil, Save, X, Shield, Mail } from 'lucide-react';
import { useTauri } from './hooks/useTauri';

interface Profile {
  name: string;
  email: string;
  initials: string;
  color: [number, number, number];
}

function App() {
  const { invoke, isReady } = useTauri();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [logs, setLogs] = useState<Array<{ timestamp: string; message: string; log_type: string }>>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [applyPhase, setApplyPhase] = useState<'idle' | 'scanning' | 'switching' | 'done'>('idle');

  const loadData = async () => {
    try {
      const p = await invoke<Profile[]>('get_profiles');
      const idx = await invoke<number | null>('get_active_index');
      setProfiles(p);
      setActiveIndex(idx);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const refreshLogs = async () => {
    try {
      const l = await invoke<typeof logs>('get_logs');
      setLogs(l);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isReady) {
      loadData();
    } else {
      setProfiles([]);
      setLoading(false);
    }
  }, [isReady]);

  // Poll logs every 2 seconds
  useEffect(() => {
    if (!isReady) return;
    refreshLogs();
    const interval = setInterval(refreshLogs, 2000);
    return () => clearInterval(interval);
  }, [isReady]);

  const handleDeleteProfile = async (index: number) => {
    try {
      await invoke('delete_profile', { index });
      await loadData();
    } catch (e) {
      console.error('Failed to delete profile', e);
    } finally {
      setDeleteIndex(null);
    }
  };

  const handleApplyIdentity = async () => {
    if (activeIndex === null) return;
    setApplying(true);
    setApplyPhase('scanning');

    // Phase 1: Scanning animation
    await new Promise(r => setTimeout(r, 800));
    setApplyPhase('switching');

    try {
      // Phase 2: Actually switch
      await invoke('switch_identity');
      setApplyPhase('done');
      // Phase 3: Success — hold for a moment
      await new Promise(r => setTimeout(r, 1200));
    } catch (e) {
      console.error(e);
    } finally {
      setApplyPhase('idle');
      setApplying(false);
    }
  };

  const handleStartEdit = () => {
    if (!activeProfile) return;
    setEditName(activeProfile.name);
    setEditEmail(activeProfile.email);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (activeIndex === null) return;
    try {
      await invoke('update_profile', { index: activeIndex, name: editName, email: editEmail });
      await loadData();
      setIsEditing(false);
    } catch (e) {
      console.error('Failed to update profile', e);
    }
  };

  const handleAddProfile = async (name: string, email: string) => {
    try {
      await invoke('add_profile', { name, email });
      await loadData();
    } catch (e) {
      console.error("Failed to add profile", e);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const activeProfile = activeIndex !== null ? profiles[activeIndex] : null;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar
        profiles={profiles}
        activeIndex={activeIndex}
        onSelect={async (idx: number) => {
          setActiveIndex(idx);
          try {
            await invoke('select_profile', { index: idx });
          } catch (e) {
            console.error('Failed to select profile', e);
          }
        }}
        onAdd={() => setIsAddOpen(true)}
        onDelete={(idx: number) => setDeleteIndex(idx)}
      />

      <AddProfileDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        onAdd={handleAddProfile}
      />

      <main className="flex-1 overflow-y-auto p-8 space-y-8">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">Manage your Git identities and contributions.</p>
          </div>
          <div className="flex items-center gap-4">
            <Button
              size="lg"
              onClick={handleApplyIdentity}
              disabled={activeIndex === null || applying}
              className={`relative overflow-hidden transition-all duration-500 min-w-[180px] ${applyPhase === 'done' ? 'bg-green-600 hover:bg-green-700 shadow-[0_0_20px_rgba(34,197,94,0.4)]' :
                applyPhase !== 'idle' ? 'bg-primary/80' : ''
                }`}
            >
              {applyPhase === 'scanning' && (
                <>
                  <Shield className="mr-2 h-4 w-4 animate-pulse" />
                  <span className="animate-pulse">Scanning...</span>
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent apply-shimmer" />
                </>
              )}
              {applyPhase === 'switching' && (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Switching Identity...
                </>
              )}
              {applyPhase === 'done' && (
                <>
                  <Check className="mr-2 h-4 w-4 apply-pop" />
                  Identity Applied!
                </>
              )}
              {applyPhase === 'idle' && (
                <>
                  <Fingerprint className="mr-2 h-4 w-4" />
                  Apply Identity
                </>
              )}
            </Button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4">
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
              <ContributionGraph username={activeProfile?.name} />
            </CardContent>
          </Card>

          <Card className="col-span-3">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>Active Configuration</CardTitle>
                <CardDescription>Current global git settings</CardDescription>
              </div>
              {activeProfile && !isEditing && (
                <Button variant="ghost" size="icon" onClick={handleStartEdit} title="Edit profile">
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {activeProfile ? (
                <div className="space-y-4">
                  <div className="flex items-center space-x-4 rounded-md border p-4">
                    <Fingerprint className="shrink-0" />
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">user.name</p>
                      {isEditing ? (
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="w-full mt-1 px-2 py-1 text-sm rounded-md border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          autoFocus
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">{activeProfile.name}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-4 rounded-md border p-4">
                    <Mail className="shrink-0" />
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">user.email</p>
                      {isEditing ? (
                        <input
                          value={editEmail}
                          onChange={e => setEditEmail(e.target.value)}
                          className="w-full mt-1 px-2 py-1 text-sm rounded-md border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">{activeProfile.email}</p>
                      )}
                    </div>
                  </div>
                  {isEditing && (
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                        <X className="mr-1 h-3 w-3" /> Cancel
                      </Button>
                      <Button size="sm" onClick={handleSaveEdit}>
                        <Save className="mr-1 h-3 w-3" /> Save
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">No profile active</div>
              )}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="labs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="labs">Labs</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>
          <TabsContent value="labs" className="space-y-4">
            <CoAuthorGenerator profiles={profiles} activeIndex={activeIndex} />
          </TabsContent>
          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>System Logs</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="h-[200px] w-full rounded-md border p-4 font-mono text-sm">
                  {logs.length > 0 ? logs.map((log, i) => (
                    <div key={i} className={`py-0.5 ${log.log_type === 'error' ? 'text-red-400' : log.log_type === 'success' ? 'text-green-400' : log.log_type === 'command' ? 'text-blue-400' : 'text-muted-foreground'}`}>
                      [{log.timestamp}] {log.message}
                    </div>
                  )) : <span className="text-muted-foreground">Waiting for logs...</span>}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteIndex !== null} onOpenChange={(open) => !open && setDeleteIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteIndex !== null ? profiles[deleteIndex]?.name : ''}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteIndex !== null && handleDeleteProfile(deleteIndex)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default App;
