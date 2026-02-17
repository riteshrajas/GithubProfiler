import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Profile {
    name: string;
    email: string;
    initials: string;
    color: [number, number, number];
}

interface SidebarProps {
    profiles: Profile[];
    activeIndex: number | null;
    onSelect: (index: number) => void;
    onAdd: () => void;
    onDelete: (index: number) => void;
}

export function Sidebar({ profiles, activeIndex, onSelect, onAdd, onDelete }: SidebarProps) {
    const rgbToHex = (c: [number, number, number]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

    return (
        <div className="w-80 border-r bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex flex-col h-full">
            <div className="p-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight">Git Profiles</h2>
                <Button variant="ghost" size="icon" onClick={onAdd}>
                    <Plus className="h-4 w-4" />
                </Button>
            </div>
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-2">
                    {profiles.map((profile, idx) => {
                        const color = rgbToHex(profile.color);
                        const isActive = idx === activeIndex;

                        return (
                            <div
                                key={idx}
                                className={cn(
                                    "group flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer hover:bg-accent",
                                    isActive ? "bg-accent border-primary" : "border-transparent bg-transparent"
                                )}
                                onClick={() => onSelect(idx)}
                            >
                                <div className="relative">
                                    <Avatar className="h-10 w-10 border-2" style={{ borderColor: `${color}80` }}>
                                        <AvatarImage src={`https://github.com/${profile.name}.png`} />
                                        <AvatarFallback style={{ backgroundColor: `${color}25`, color }}>
                                            {profile.initials}
                                        </AvatarFallback>
                                    </Avatar>
                                    {isActive && (
                                        <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                                        </span>
                                    )}
                                </div>

                                <div className="flex-1 overflow-hidden">
                                    <div className="font-medium truncate">{profile.name}</div>
                                    <div className="text-xs text-muted-foreground truncate">{profile.email}</div>
                                </div>

                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDelete(idx); }}
                                    >
                                        <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </ScrollArea>
        </div>
    );
}
