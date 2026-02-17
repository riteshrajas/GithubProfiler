import { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { ContributionGraph } from './components/dashboard/ContributionGraph';
import { CoAuthorGenerator } from './components/labs/CoAuthorGenerator';
import { AddProfileDialog } from './components/profile/AddProfileDialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Check, Fingerprint } from 'lucide-react';
import { useTauri } from './hooks/useTauri';

// Mock Data for dev
const MOCK_PROFILES = [
  { name: 'riteshrajas', email: 'ritesh@example.com', initials: 'RR', color: [100, 200, 255] as [number, number, number] },
  { name: 'feds-programming', email: 'feds@example.com', initials: 'FP', color: [255, 100, 100] as [number, number, number] }
];

function App() {
  const { invoke, isReady } = useTauri();
  const [profiles, setProfiles] = useState<typeof MOCK_PROFILES>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [logs, setLogs] = useState<Array<{ timestamp: string; message: string; log_type: string }>>([]);

  const loadData = async () => {
    try {
      const p = await invoke<typeof MOCK_PROFILES>('get_profiles');
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
      setProfiles(MOCK_PROFILES);
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
    try {
      await invoke('switch_identity');
      console.log('Switched!');
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setApplying(false), 1000);
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
        onSelect={setActiveIndex}
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
              className={applying ? "bg-green-600 hover:bg-green-700" : ""}
            >
              {applying ? <Check className="mr-2 h-4 w-4" /> : <Fingerprint className="mr-2 h-4 w-4" />}
              {applying ? "Applied Identity" : "Apply Identity"}
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
            <CardHeader>
              <CardTitle>Active Configuration</CardTitle>
              <CardDescription>Current global git settings</CardDescription>
            </CardHeader>
            <CardContent>
              {activeProfile ? (
                <div className="space-y-4">
                  <div className="flex items-center space-x-4 rounded-md border p-4">
                    <Fingerprint />
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">user.name</p>
                      <p className="text-sm text-muted-foreground">{activeProfile.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4 rounded-md border p-4">
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">user.email</p>
                      <p className="text-sm text-muted-foreground">{activeProfile.email}</p>
                    </div>
                  </div>
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
