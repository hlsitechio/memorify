import { Icon, createIcon, type IconProps } from './Icon';

// Only custom domain icons - Lucide handles the rest
export {
  // Brand
  MemorifyMark,
  MemorifyWordmark,
  
  // Memory Domain
  MemoryCore,
  MemoryStack,
  MemoryNode,
  MemoryLink,
  
  // Agent Domain
  AgentBot,
  AgentOrbit,
  AgentNetwork,
  AgentPulse,
  AgentTerminal,
  
  // MCP / Protocol
  MCPServer,
  MCPTool,
  ProtocolStream,
  
  // Skills / Automation
  SkillWand,
  SkillLightning,
  
  // Connectors
  ConnectorHub,
  ConnectorFlow,
  
  // Observability
  SignalWave,
  LogStream,
  
  // Vault / Security
  VaultLock,
  KeyMaster,
} from './icons.tsx';

export type { IconProps };
export { Icon, createIcon };