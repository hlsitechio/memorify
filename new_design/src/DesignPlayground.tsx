import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Toaster } from "@/components/ui/toaster";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import {
  MemorifyMark,
  MemoryCore,
  AgentBot,
  MCPServer,
  SkillWand,
  ConnectorHub,
  VaultLock,
  SignalWave,
} from "@/components/icons";

const icons = [
  { name: "MemorifyMark", component: MemorifyMark },
  { name: "MemoryCore", component: MemoryCore },
  { name: "AgentBot", component: AgentBot },
  { name: "MCPServer", component: MCPServer },
  { name: "SkillWand", component: SkillWand },
  { name: "ConnectorHub", component: ConnectorHub },
  { name: "VaultLock", component: VaultLock },
  { name: "SignalWave", component: SignalWave },
];

const colorTokens = [
  { name: "background", light: "hsl(var(--background))", dark: "hsl(var(--background))" },
  { name: "foreground", light: "hsl(var(--foreground))", dark: "hsl(var(--foreground))" },
  { name: "card", light: "hsl(var(--card))", dark: "hsl(var(--card))" },
  { name: "card-elevated", light: "hsl(var(--card-elevated))", dark: "hsl(var(--card-elevated))" },
  { name: "primary", light: "hsl(var(--primary))", dark: "hsl(var(--primary))" },
  { name: "primary-glow", light: "hsl(var(--primary-glow))", dark: "hsl(var(--primary-glow))" },
  { name: "secondary", light: "hsl(var(--secondary))", dark: "hsl(var(--secondary))" },
  { name: "muted", light: "hsl(var(--muted))", dark: "hsl(var(--muted))" },
  { name: "accent", light: "hsl(var(--accent))", dark: "hsl(var(--accent))" },
  { name: "border", light: "hsl(var(--border))", dark: "hsl(var(--border))" },
  { name: "input", light: "hsl(var(--input))", dark: "hsl(var(--input))" },
  { name: "ring", light: "hsl(var(--ring))", dark: "hsl(var(--ring))" },
  { name: "destructive", light: "hsl(var(--destructive))", dark: "hsl(var(--destructive))" },
  { name: "success", light: "hsl(var(--success))", dark: "hsl(var(--success))" },
  { name: "warning", light: "hsl(var(--warning))", dark: "hsl(var(--warning))" },
];

const shadows = [
  { name: "elevation-1", class: "shadow-elevation-1" },
  { name: "elevation-2", class: "shadow-elevation-2" },
  { name: "elevation-3", class: "shadow-elevation-3" },
  { name: "elevation-4", class: "shadow-elevation-4" },
  { name: "modal", class: "shadow-modal" },
  { name: "glow", class: "shadow-glow" },
  { name: "glow-subtle", class: "shadow-glow-subtle" },
  { name: "inner", class: "shadow-inner" },
];

export default function DesignPlayground() {
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");

  React.useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
  }, [theme]);

  return (
    <TooltipProvider>
      <div className={`min-h-screen bg-background text-foreground transition-colors duration-base ${theme}`}>
        <Toaster />
        {/* Header */}
        <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MemorifyMark className="w-8 h-8 text-primary" />
              <span className="text-heading-lg font-semibold">Memorify Design Playground</span>
              <Badge variant="secondary" className="text-xs">UI Only</Badge>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-body-sm text-muted-foreground">Theme:</span>
                <Select value={theme} onValueChange={setTheme as (v: "dark" | "light") => void}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          <Tabs defaultValue="components" className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-6">
              <TabsTrigger value="components">Components</TabsTrigger>
              <TabsTrigger value="colors">Color Tokens</TabsTrigger>
              <TabsTrigger value="icons">Icons</TabsTrigger>
              <TabsTrigger value="shadows">Shadows</TabsTrigger>
            </TabsList>

            {/* Components Tab */}
            <TabsContent value="components" className="space-y-8 animate-fade-in">
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-heading-md">Buttons</h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button>Default</Button>
                  <Button variant="destructive">Destructive</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="link">Link</Button>
                  <Separator orientation="vertical" className="h-8 mx-2" />
                  <Button size="sm">Small</Button>
                  <Button size="lg">Large</Button>
                  <Button size="icon"><MemoryCore className="w-4 h-4" /></Button>
                </div>
              </section>

              <section>
                <h2 className="text-heading-md mb-4">Cards</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Card className="card-interactive">
                    <CardHeader>
                      <CardTitle>Default Card</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-body text-muted-foreground">Standard card with border and subtle shadow</p>
                    </CardContent>
                  </Card>
                  <Card className="card-elevated card-interactive">
                    <CardHeader>
                      <CardTitle>Elevated Card</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-body text-muted-foreground">Elevated card with stronger shadow and border</p>
                    </CardContent>
                  </Card>
                  <Card className="border-primary/30 shadow-glow-subtle card-interactive">
                    <CardHeader>
                      <CardTitle>Primary Glow Card</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-body text-muted-foreground">Card with primary glow shadow and border</p>
                    </CardContent>
                  </Card>
                </div>
              </section>

              <section>
                <h2 className="text-heading-md mb-4">Form Controls</h2>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Input</Label>
                    <Input placeholder="Type something..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Textarea</Label>
                    <Textarea placeholder="Longer text..." rows={3} />
                  </div>
                  <div className="space-y-2">
                    <Label>Select</Label>
                    <Select>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Option 1</SelectItem>
                        <SelectItem value="2">Option 2</SelectItem>
                        <SelectItem value="3">Option 3</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Checkbox</Label>
                    <div className="flex items-center gap-2">
                      <Checkbox id="check1" />
                      <Label htmlFor="check1" className="cursor-pointer">Check me</Label>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Radio Group</Label>
                    <RadioGroup defaultValue="a">
                      <div className="flex items-center space-x-4">
                        <RadioGroupItem value="a" id="r1" /><Label htmlFor="r1">Option A</Label>
                        <RadioGroupItem value="b" id="r2" /><Label htmlFor="r2">Option B</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="space-y-2">
                    <Label>Switch</Label>
                    <Switch id="switch1" />
                  </div>
                  <div className="space-y-2">
                    <Label>Slider</Label>
                    <Slider defaultValue={[33]} max={100} step={1} />
                  </div>
                  <div className="space-y-2">
                    <Label>Progress</Label>
                    <Progress value={66} />
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-heading-md mb-4">Badges & Feedback</h2>
                <div className="flex flex-wrap gap-3 mb-6">
                  <Badge>Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="destructive">Destructive</Badge>
                  <Badge variant="outline">Outline</Badge>
                  <Badge className="bg-primary/20 text-primary border-primary/30">Custom Primary</Badge>
                  <Badge className="bg-success/20 text-success border-success/30">Success</Badge>
                  <Badge className="bg-warning/20 text-warning border-warning/30">Warning</Badge>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Alert>
                    <AlertTitle>Info Alert</AlertTitle>
                    <AlertDescription>This is an informational alert message.</AlertDescription>
                  </Alert>
                  <Alert variant="destructive">
                    <AlertTitle>Error Alert</AlertTitle>
                    <AlertDescription>Something went wrong. Please try again.</AlertDescription>
                  </Alert>
                </div>
              </section>

              <section>
                <h2 className="text-heading-md mb-4">Overlays & Navigation</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Card>
                    <CardHeader><CardTitle>Dialog</CardTitle></CardHeader>
                    <CardContent>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline">Open Dialog</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Dialog Title</DialogTitle>
                          </DialogHeader>
                          <p className="text-body text-muted-foreground mt-4">Dialog content goes here.</p>
                        </DialogContent>
                      </Dialog>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Sheet</CardTitle></CardHeader>
                    <CardContent>
                      <Sheet>
                        <SheetTrigger asChild>
                          <Button variant="outline">Open Sheet</Button>
                        </SheetTrigger>
                        <SheetContent>
                          <SheetHeader>
                            <SheetTitle>Sheet Title</SheetTitle>
                          </SheetHeader>
                          <p className="text-body text-muted-foreground mt-4">Sheet content from side.</p>
                        </SheetContent>
                      </Sheet>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Popover</CardTitle></CardHeader>
                    <CardContent>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline">Open Popover</Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64">
                          <p className="text-body text-muted-foreground">Popover content here.</p>
                        </PopoverContent>
                      </Popover>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Dropdown Menu</CardTitle></CardHeader>
                    <CardContent>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline">Open Menu</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem>Profile</DropdownMenuItem>
                          <DropdownMenuItem>Settings</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">Log out</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Tooltip</CardTitle></CardHeader>
                    <CardContent>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline">Hover me</Button>
                        </TooltipTrigger>
                        <TooltipContent>Tooltip content</TooltipContent>
                      </Tooltip>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Command Palette</CardTitle></CardHeader>
                    <CardContent>
                      <Command>
                        <CommandInput placeholder="Type to search..." />
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem>Calendar</CommandItem>
                          <CommandItem>Search Emoji</CommandItem>
                          <CommandItem>Calculator</CommandItem>
                        </CommandGroup>
                      </Command>
                    </CardContent>
                  </Card>
                </div>
              </section>

              <section>
                <h2 className="text-heading-md mb-4">Data Display</h2>
                <Card>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[300px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell>Agent Alpha</TableCell>
                            <TableCell>Memory</TableCell>
                            <TableCell><Badge variant="secondary">Active</Badge></TableCell>
                            <TableCell><Button variant="ghost" size="sm">Edit</Button></TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Agent Beta</TableCell>
                            <TableCell>Tools</TableCell>
                            <TableCell><Badge variant="secondary">Active</Badge></TableCell>
                            <TableCell><Button variant="ghost" size="sm">Edit</Button></TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Agent Gamma</TableCell>
                            <TableCell>Connectors</TableCell>
                            <TableCell><Badge variant="outline">Idle</Badge></TableCell>
                            <TableCell><Button variant="ghost" size="sm">Edit</Button></TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </section>

              <section>
                <h2 className="text-heading-md mb-4">Accordion</h2>
                <Accordion type="single" collapsible className="w-full max-w-md">
                  <AccordionItem value="item-1">
                    <AccordionTrigger>What is Memorify?</AccordionTrigger>
                    <AccordionContent>Memorify is the motherboard for AI agents — one backend that any AI agent can plug into.</AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-2">
                    <AccordionTrigger>How does it work?</AccordionTrigger>
                    <AccordionContent>Agents connect via MCP over HTTPS. No SDK required. Memory, tools, files, and connectors behind a single gateway.</AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-3">
                    <AccordionTrigger>Is it secure?</AccordionTrigger>
                    <AccordionContent>Yes. SECURITY FIRST. Workspace isolation via Neon RLS, Clerk auth, short-lived JWTs, agent tokens with scoped permissions.</AccordionContent>
                  </AccordionItem>
                </Accordion>
              </section>

              <section>
                <h2 className="text-heading-md mb-4">Avatar</h2>
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
                    <AvatarFallback>SC</AvatarFallback>
                  </Avatar>
                  <Avatar className="md">
                    <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
                    <AvatarFallback>SC</AvatarFallback>
                  </Avatar>
                  <Avatar className="lg">
                    <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
                    <AvatarFallback>SC</AvatarFallback>
                  </Avatar>
                  <Avatar className="xl">
                    <AvatarFallback>MF</AvatarFallback>
                  </Avatar>
                </div>
              </section>
            </TabsContent>

            {/* Colors Tab */}
            <TabsContent value="colors" className="animate-fade-in">
              <h2 className="text-heading-md mb-4">Color Tokens</h2>
              <p className="text-body text-muted-foreground mb-6">All semantic colors from the Memorify design system. Switch theme in header to see light/dark variants.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {colorTokens.map((token) => (
                  <Card key={token.name} className="card-interactive">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-caption font-medium text-muted-foreground uppercase tracking-wider">{token.name}</span>
                      </div>
                      <div 
                        className="h-16 rounded-lg border border-border/50 relative overflow-hidden"
                        style={{ background: `var(--${token.name.replace(/-/g, '-')})` }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-t from-background/50 to-transparent" />
                      </div>
                      <div className="mt-2 flex gap-2 text-xs font-mono text-muted-foreground">
                        <code>{token.light}</code>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <h2 className="text-heading-md mt-10 mb-4">Gradients</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { name: "Primary", class: "bg-gradient-primary" },
                  { name: "Radial", class: "bg-gradient-radial" },
                  { name: "Mesh", class: "bg-gradient-mesh" },
                  { name: "Subtle", class: "bg-gradient-subtle" },
                  { name: "Grid", class: "bg-grid" },
                ].map((g) => (
                  <Card key={g.name} className="card-interactive">
                    <CardContent className="p-4">
                      <div className={`h-24 rounded-lg border border-border/50 ${g.class}`} />
                      <div className="mt-2 text-caption font-medium">{g.name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{g.class}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Icons Tab */}
            <TabsContent value="icons" className="animate-fade-in">
              <h2 className="text-heading-md mb-4">Custom Icons (No Lucide)</h2>
              <p className="text-body text-muted-foreground mb-6">All icons are custom SVG — no external icon library. Stroke width 1.5, 24x24 viewBox.</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {icons.map(({ name, component: Icon }) => (
                  <Card key={name} className="card-interactive text-center py-6">
                    <CardContent>
                      <div className="flex justify-center mb-3">
                        <Icon className="w-10 h-10 text-foreground" />
                      </div>
                      <div className="text-caption font-medium">{name}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Shadows Tab */}
            <TabsContent value="shadows" className="animate-fade-in">
              <h2 className="text-heading-md mb-4">Shadow System</h2>
              <p className="text-body text-muted-foreground mb-6">Elevation shadows + glow shadows + inner shadows. All use CSS variables with colored border + external shadow.</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {shadows.map(({ name, class: className }) => (
                  <Card key={name} className="card-interactive">
                    <CardContent className="p-6">
                      <div className={`h-24 rounded-lg border border-border/50 ${className} flex items-center justify-center`}>
                        <span className="text-body text-muted-foreground">{name}</span>
                      </div>
                      <div className="mt-3 text-xs font-mono text-muted-foreground">{className}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </main>

        <footer className="border-t border-border/50 bg-card/50 backdrop-blur-sm mt-12">
          <div className="container mx-auto px-4 py-4 text-center text-body-sm text-muted-foreground">
            Memorify Design Playground — Local UI experimentation without Netlify builds
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}