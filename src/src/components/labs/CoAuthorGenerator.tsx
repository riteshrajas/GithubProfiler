import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Copy, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Profile {
    name: string;
    email: string;
    initials: string;
    color: [number, number, number];
}

interface CoAuthorGeneratorProps {
    profiles: Profile[];
    activeIndex: number | null;
}

export function CoAuthorGenerator({ profiles, activeIndex }: CoAuthorGeneratorProps) {
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [copied, setCopied] = useState(false);

    const toggleProfile = (index: number) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    const selectAll = () => {
        const all = new Set(profiles.map((_, i) => i).filter(i => i !== activeIndex));
        setSelected(all);
    };

    const clearAll = () => setSelected(new Set());

    const trailerText = useMemo(() => {
        return Array.from(selected)
            .sort()
            .map(idx => {
                const p = profiles[idx];
                return `Co-authored-by: ${p.name} <${p.email}>`;
            })
            .join('\n');
    }, [selected, profiles]);

    const handleCopy = async () => {
        if (!trailerText) return;
        try {
            await navigator.clipboard.writeText(trailerText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (e) {
            console.error('Failed to copy', e);
        }
    };

    const rgbStr = (c: [number, number, number]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            Co-Author Generator
                        </CardTitle>
                        <CardDescription className="mt-1">
                            Select profiles to generate git co-author trailers for your commits.
                        </CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
                        <Button variant="ghost" size="sm" onClick={clearAll}>Clear</Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Profile Selection Grid */}
                <ScrollArea className="h-[200px] rounded-md border">
                    <div className="p-3 space-y-1">
                        {profiles.map((profile, idx) => {
                            const isSelected = selected.has(idx);
                            const isActive = idx === activeIndex;
                            const color = rgbStr(profile.color);

                            return (
                                <div
                                    key={idx}
                                    onClick={() => toggleProfile(idx)}
                                    className={cn(
                                        "flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all",
                                        "hover:bg-accent/50",
                                        isSelected
                                            ? "bg-primary/10 border border-primary/30"
                                            : "border border-transparent"
                                    )}
                                >
                                    {/* Checkbox indicator */}
                                    <div className={cn(
                                        "flex items-center justify-center h-5 w-5 rounded border-2 transition-colors shrink-0",
                                        isSelected
                                            ? "bg-primary border-primary text-primary-foreground"
                                            : "border-muted-foreground/30"
                                    )}>
                                        {isSelected && <Check className="h-3 w-3" />}
                                    </div>

                                    <Avatar className="h-8 w-8 border" style={{ borderColor: `${color}60` }}>
                                        <AvatarImage src={`https://github.com/${profile.name}.png`} />
                                        <AvatarFallback style={{ backgroundColor: `${color}20`, color, fontSize: '0.7rem' }}>
                                            {profile.initials}
                                        </AvatarFallback>
                                    </Avatar>

                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate">
                                            {profile.name}
                                            {isActive && (
                                                <span className="ml-2 text-xs text-muted-foreground">(active)</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground truncate">{profile.email}</div>
                                    </div>
                                </div>
                            );
                        })}

                        {profiles.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                No profiles available. Add some profiles first.
                            </div>
                        )}
                    </div>
                </ScrollArea>

                {/* Preview & Copy */}
                {trailerText && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">
                                Preview ({selected.size} selected)
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCopy}
                                className={cn(
                                    "transition-all",
                                    copied && "bg-green-600 hover:bg-green-700 text-white border-green-600"
                                )}
                            >
                                {copied ? (
                                    <><Check className="mr-1.5 h-3.5 w-3.5" /> Copied!</>
                                ) : (
                                    <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy to Clipboard</>
                                )}
                            </Button>
                        </div>
                        <pre className="p-3 rounded-md border bg-muted/50 text-sm font-mono whitespace-pre-wrap break-all">
                            {trailerText}
                        </pre>
                    </div>
                )}

                {!trailerText && (
                    <div className="text-center py-4 text-muted-foreground text-sm border rounded-md border-dashed">
                        Select profiles above to generate co-author trailers
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
