import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { GitHubCalendar } from 'react-github-calendar';

interface ContributionGraphProps {
    username?: string;
}

export function ContributionGraph({ username }: ContributionGraphProps) {
    if (!username) {
        return (
            <Card className="w-full">
                <CardContent className="p-6 text-center text-muted-foreground">
                    Select a profile to view contributions
                </CardContent>
            </Card>
        );
    }

    const explicitTheme = {
        light: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
        dark: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
    };

    return (
        <Card className="w-full overflow-hidden bg-background/50 backdrop-blur">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
                    Contribution Graph
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ScrollArea className="w-full whitespace-nowrap rounded-md border bg-card/50 p-4">
                    <div className="flex w-max space-x-4">
                        <GitHubCalendar
                            username={username}
                            theme={explicitTheme}
                            colorScheme="dark"
                            blockSize={12}
                            blockMargin={4}
                            fontSize={12}
                            year="last"
                        />
                    </div>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
