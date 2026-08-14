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
  <rect key="rect" x="3" y="7" width="18" height="10" rx="2" />,
  <path key="cross" d="M7 12h10M12 7v10" strokeWidth="1.5" />,
  <circle key="center" cx="12" cy="12" r="2" fill="currentColor" strokeWidth="0" />,
]);

export const MemoryStack = createIcon('MemoryStack', [
  <path key="layer1" d="M4 18v-4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />,
  <path key="layer2" d="M4 14v-4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />,
  <path key="layer3" d="M4 10v-4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />,
]);

export const MemoryNode = createIcon('MemoryNode', [
  <circle key="outer" cx="12" cy="12" r="8" />,
  <circle key="middle" cx="12" cy="12" r="4" />,
  <circle key="inner" cx="12" cy="12" r="1.5" fill="currentColor" strokeWidth="0" />,
]);

export const MemoryLink = createIcon('MemoryLink', [
  <path key="arc1" d="M6 12a6 6 0 0 1 12 0" />,
  <path key="arc2" d="M18 12a6 6 0 0 1-12 0" />,
  <circle key="center" cx="12" cy="12" r="3" fill="currentColor" strokeWidth="0" />,
]);

// Agent Domain
export const AgentBot = createIcon('AgentBot', [
  <rect key="head" x="3" y="3" width="18" height="18" rx="4" />,
  <circle key="eye1" cx="9" cy="10" r="1.5" fill="currentColor" strokeWidth="0" />,
  <circle key="eye2" cx="15" cy="10" r="1.5" fill="currentColor" strokeWidth="0" />,
  <path key="mouth" d="M9 16h6" strokeLinecap="round" />,
  <path key="antenna" d="M12 3v2M12 19v2M3 12h2M19 12h2" strokeWidth="1.5" />,
]);

export const AgentOrbit = createIcon('AgentOrbit', [
  <circle key="orbit" cx="12" cy="12" r="10" strokeDasharray="4 4" />,
  <circle key="center" cx="12" cy="12" r="3" fill="currentColor" strokeWidth="0" />,
  <circle key="sat1" cx="22" cy="12" r="3" />,
  <circle key="sat2" cx="12" cy="2" r="3" />,
  <circle key="sat3" cx="2" cy="12" r="3" />,
  <circle key="sat4" cx="12" cy="22" r="3" />,
]);

export const AgentNetwork = createIcon('AgentNetwork', [
  <circle key="node1" cx="6" cy="6" r="2.5" fill="currentColor" strokeWidth="0" />,
  <circle key="node2" cx="18" cy="6" r="2.5" fill="currentColor" strokeWidth="0" />,
  <circle key="node3" cx="12" cy="18" r="2.5" fill="currentColor" strokeWidth="0" />,
  <path key="edge1" d="M8.5 7.5L15.5 7.5" />,
  <path key="edge2" d="M15.5 7.5L14 16.5" />,
  <path key="edge3" d="M14 16.5L10 7.5" />,
  <path key="edge4" d="M10 7.5L8.5 7.5" />,
]);

export const AgentPulse = createIcon('AgentPulse', [
  <path key="line" d="M3 12h18" />,
  <path key="arc1" d="M3 12a9 9 0 0 1 18 0" strokeWidth="1" />,
  <path key="arc2" d="M3 12a9 9 0 0 0 18 0" strokeWidth="1" />,
  <circle key="center" cx="12" cy="12" r="3" fill="currentColor" strokeWidth="0" />,
]);

export const AgentTerminal = createIcon('AgentTerminal', [
  <rect key="screen" x="3" y="3" width="18" height="18" rx="2" />,
  <path key="line1" d="M7 10h10" />,
  <path key="line2" d="M7 14h7" />,
  <path key="line3" d="M7 18h4" />,
  <path key="cursor" d="M12 3v2M12 19v2" strokeWidth="1" />,
]);

// MCP / Protocol
export const MCPServer = createIcon('MCPServer', [
  <rect key="rack1" x="2" y="4" width="20" height="7" rx="1" />,
  <rect key="rack2" x="2" y="13" width="20" height="7" rx="1" />,
  <path key="leds1" d="M6 8h12M6 17h12" strokeWidth="1" />,
  <circle key="status" cx="12" cy="11.5" r="1.5" fill="currentColor" strokeWidth="0" />,
]);

export const MCPTool = createIcon('MCPTool', [
  <path key="diamond" d="M12 3L4 9l8 8 8-8-8-8z" />,
  <circle key="center" cx="12" cy="11" r="2" fill="currentColor" strokeWidth="0" />,
  <path key="handle" d="M12 16v4M9 19h6" strokeWidth="1.5" />,
]);

export const ProtocolStream = createIcon('ProtocolStream', [
  <path key="main" d="M4 12h16" />,
  <path key="branch1" d="M4 8h10" strokeWidth="1.5" />,
  <path key="branch2" d="M10 16h10" strokeWidth="1.5" />,
  <path key="vert1" d="M8 4v16" strokeWidth="1" strokeDasharray="2 2" />,
  <path key="vert2" d="M16 4v16" strokeWidth="1" strokeDasharray="2 2" />,
  <circle key="center" cx="12" cy="12" r="2" fill="currentColor" strokeWidth="0" />,
]);

// Skills / Automation
export const SkillWand = createIcon('SkillWand', [
  <path key="spark1" d="M15 3l-9 9" />,
  <path key="spark2" d="M6 12l4 4" />,
  <path key="spark3" d="M10 16l4-4" />,
  <circle key="tip" cx="18" cy="6" r="3" fill="currentColor" strokeWidth="0" />,
  <path key="glow" d="M18 3v3M18 21v-3M21 6h-3M3 6h3" strokeWidth="1" />,
]);

export const SkillLightning = createIcon('SkillLightning', [
  <path key="bolt" d="M13 3L9 13h4l-3 8 7-8h-4l3-8z" fill="currentColor" strokeWidth="0" />,
]);

// Connectors
export const ConnectorHub = createIcon('ConnectorHub', [
  <circle key="center" cx="12" cy="12" r="3" fill="currentColor" strokeWidth="0" />,
  <circle key="ring" cx="12" cy="12" r="9" strokeDasharray="3 3" />,
  <circle key="north" cx="12" cy="3" r="2.5" fill="currentColor" strokeWidth="0" />,
  <circle key="east" cx="21" cy="12" r="2.5" fill="currentColor" strokeWidth="0" />,
  <circle key="south" cx="12" cy="21" r="2.5" fill="currentColor" strokeWidth="0" />,
  <circle key="west" cx="3" cy="12" r="2.5" fill="currentColor" strokeWidth="0" />,
  <path key="spoke1" d="M12 5.5v2.5" strokeWidth="1.5" />,
  <path key="spoke2" d="M12 16v2.5" strokeWidth="1.5" />,
  <path key="spoke3" d="M5.5 12h2.5" strokeWidth="1.5" />,
  <path key="spoke4" d="M16 12h2.5" strokeWidth="1.5" />,
]);

export const ConnectorFlow = createIcon('ConnectorFlow', [
  <path key="left" d="M4 12h6" />,
  <path key="right" d="M14 12h6" />,
  <path key="arrow" d="M10 8l4 4-4 4" />,
  <circle key="center" cx="12" cy="12" r="3" strokeDasharray="2 2" />,
]);

// Observability
export const SignalWave = createIcon('SignalWave', [
  <path key="wave" d="M4 16v-4a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v4M8 12h8M4 20h16" />,
]);

export const LogStream = createIcon('LogStream', [
  <path key="line1" d="M4 6h16" />,
  <path key="line2" d="M4 12h12" />,
  <path key="line3" d="M4 18h8" />,
  <path key="cursor" d="M20 6v12" strokeWidth="1" strokeDasharray="2 2" />,
]);

// Vault / Security
export const VaultLock = createIcon('VaultLock', [
  <rect key="body" x="4" y="8" width="16" height="12" rx="2" />,
  <path key="shackle" d="M8 8V5a3 3 0 0 1 6 0v3" />,
  <circle key="keyhole" cx="12" cy="15" r="2" />,
]);

export const KeyMaster = createIcon('KeyMaster', [
  <path key="key" d="M15 6v12a3 3 0 1 0-3-3H6a3 3 0 1 0 0 6h6" />,
  <circle key="bow_outer" cx="15" cy="6" r="3" />,
  <circle key="bow_inner" cx="15" cy="6" r="1" fill="currentColor" strokeWidth="0" />,
]);