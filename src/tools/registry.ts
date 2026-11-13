import type { Tool } from './types'

const tools = new Map<string, Tool>()

export function registerTool(tool: Tool): void {
  tools.set(tool.id, tool)
}

export function getTool(id: string): Tool | undefined {
  return tools.get(id)
}

export function listTools(): Tool[] {
  return [...tools.values()]
}
