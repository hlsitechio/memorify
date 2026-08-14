import { createIcon } from './Icon';

/**
 * Minimal custom icons - only what Lucide doesn't have
 * Domain-specific concepts for Memorify
 */

// Brand
export const MemorifyMark = createIcon('MemorifyMark', [
  <path key="circuit" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />,
  <circle key="core" cx="12" cy="12" r="3" />,
], { strokeWidth: 1.5 });

export const MemorifyWordmark = createIcon('MemorifyWordmark', [
  <path key="M" d="M4 20V8l4 6 4-6v12" />,
  <path key="e" d="M16 14h5M16 10h5M16 18h3" />,
  <path key="m2" d="M25 20V8l4 6 4-6v12" />,
  <path key="o" d="M38 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />,
  <path key="r" d="M46 10h4a3 3 0 0 1 3 3v4M46 10l4 6" />,
  <path key="i" d="M55 10v10" />,
  <path key="f" d="M60 10h5M60 14h3M62 10v10" />,
  <path key="y" d="M68 14l3 6M71 14l-3 6" />,
], { strokeWidth: 1.5, size: 32 });

// Memory Domain
export const MemoryCore = createIcon('MemoryCore', [
  <rect x="3" y="7" width="18" height="10" rx="2" />,
  <path d="M7 12h10M12 7v10" strokeWidth="1.5" />,
  <circle cx="12" cy="12" r="2" fill="currentColor" strokeWidth="0" />,
]);

export const MemoryStack = createIcon('MemoryStack', [
  <path d="M4 18v-4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />
  <path d="M4 14v-4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />
  <path d="M4 10v-4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />
]);

export const MemoryNode = createIcon('MemoryNode', [
  <circle cx="12" cy="12" r="8" />
  <circle cx="12" cy="12" r="4" />
  <circle cx="12" cy="12" r="1.5" fill="currentColor" strokeWidth="0" />
]);

export const MemoryLink = createIcon('MemoryLink', [
  <path d="M6 12a6 6 0 0 1 12 0" />
  <path d="M18 12a6 6 0 0 1-12 0" />
  <circle cx="12" cy="12" r="3" fill="currentColor" strokeWidth="0" />
]);

// Agent Domain
export const AgentBot = createIcon('AgentBot', [
  <rect x="3" y="3" width="18" height="18" rx="4" />
  <circle cx="9" cy="10" r="1.5" fill="currentColor" strokeWidth="0" />
  <circle cx="15" cy="10" r="1.5" fill="currentColor" strokeWidth="0" />
  <path d="M9 16h6" strokeLinecap="round" />
  <path d="M12 3v2M12 19v2M3 12h2M19 12h2" strokeWidth="1.5" />
]);

export const AgentOrbit = createIcon('AgentOrbit', [
  <circle cx="12" cy="12" r="10" strokeDasharray="4 4" />
  <circle cx="12" cy="12" r="3" fill="currentColor" strokeWidth="0" />
  <circle cx="22" cy="12" r="3" />
  <circle cx="12" cy="2" r="3" />
  <circle cx="2" cy="12" r="3" />
  <circle cx="12" cy="22" r="3" />
]);

export const AgentNetwork = createIcon('AgentNetwork', [
  <circle cx="6" cy="6" r="2.5" fill="currentColor" strokeWidth="0" />
  <circle cx="18" cy="6" r="2.5" fill="currentColor" strokeWidth="0" />
  <circle cx="12" cy="18" r="2.5" fill="currentColor" strokeWidth="0" />
  <path d="M8.5 7.5L15.5 7.5" />
  <path d="M15.5 7.5L14 16.5" />
  <path d="M14 16.5L10 7.5" />
  <path d="M10 7.5L8.5 7.5" />
]);

export const AgentPulse = createIcon('AgentPulse', [
  <path d="M3 12h18M3 12a9 9 0 0 1 18 0M3 12a9 9 0 0 0 18 0" strokeWidth="1" />
  <circle cx="12" cy="12" r="3" fill="currentColor" strokeWidth="0" />
]);

export const AgentTerminal = createIcon('AgentTerminal', [
  <rect x="3" y="3" width="18" height="18" rx="2" />
  <path d="M7 10h10M7 14h7M7 18h4" />
  <path d="M12 3v2M12 19v2" strokeWidth="1" />
]);

// MCP / Protocol
export const MCPServer = createIcon('MCPServer', [
  <rect x="2" y="4" width="20" height="7" rx="1" />
  <rect x="2" y="13" width="20" height="7" rx="1" />
  <path d="M6 8h12M6 17h12" strokeWidth="1" />
  <circle cx="12" cy="11.5" r="1.5" fill="currentColor" strokeWidth="0" />
]);

export const MCPTool = createIcon('MCPTool', [
  <path d="M12 3L4 9l8 8 8-8-8-8z" />
  <circle cx="12" cy="11" r="2" fill="currentColor" strokeWidth="0" />
  <path d="M12 16v4M9 19h6" strokeWidth="1.5" />
]);

export const ProtocolStream = createIcon('ProtocolStream', [
  <path d="M4 12h16" />
  <path d="M4 8h10M10 16h10" strokeWidth="1.5" />
  <path d="M8 4v16M16 4v16" strokeWidth="1" strokeDasharray="2 2" />
  <circle cx="12" cy="12" r="2" fill="currentColor" strokeWidth="0" />
]);

// Skills / Automation
export const SkillWand = createIcon('SkillWand', [
  <path d="M15 3l-9 9" />
  <path d="M6 12l4 4" />
  <path d="M10 16l4-4" />
  <circle cx="18" cy="6" r="3" fill="currentColor" strokeWidth="0" />
  <path d="M18 3v3M18 21v-3M21 6h-3M3 6h3" strokeWidth="1" />
]);

export const SkillLightning = createIcon('SkillLightning', [
  <path d="M13 3L9 13h4l-3 8 7-8h-4l3-8z" fill="currentColor" strokeWidth="0" />
]);

// Connectors
export const ConnectorHub = createIcon('ConnectorHub', [
  <circle cx="12" cy="12" r="3" fill="currentColor" strokeWidth="0" />
  <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
  <circle cx="12" cy="3" r="2.5" fill="currentColor" strokeWidth="0" />
  <circle cx="21" cy="12" r="2.5" fill="currentColor" strokeWidth="0" />
  <circle cx="12" cy="21" r="2.5" fill="currentColor" strokeWidth="0" />
  <circle cx="3" cy="12" r="2.5" fill="currentColor" strokeWidth="0" />
  <path d="M12 5.5v2.5M12 16v2.5M5.5 12h2.5M16 12h2.5" strokeWidth="1.5" />
]);

export const ConnectorFlow = createIcon('ConnectorFlow', [
  <path d="M4 12h6M14 12h6" />
  <path d="M10 8l4 4-4 4" />
  <circle cx="12" cy="12" r="3" strokeDasharray="2 2" />
]);

// Observability
export const SignalWave = createIcon('SignalWave', [
  <path d="M4 16v-4a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v4M8 12h8M4 20h16" />
]);

export const LogStream = createIcon('LogStream', [
  <path d="M4 6h16M4 12h12M4 18h8" />
  <path d="M20 6v12" strokeWidth="1" strokeDasharray="2 2" />
]);

// Vault / Security
export const VaultLock = createIcon('VaultLock', [
  <rect x="4" y="8" width="16" height="12" rx="2" />
  <path d="M8 8V5a3 3 0 0 1 6 0v3" />
  <circle cx="12" cy="15" r="2" />
]);

export const KeyMaster = createIcon('KeyMaster', [
  <path d="M15 6v12a3 3 0 1 0-3-3H6a3 3 0 1 0 0 6h6" />
  <circle cx="15" cy="6" r="3" />
  <circle cx="15" cy="6" r="1" fill="currentColor" strokeWidth="0" />
]);