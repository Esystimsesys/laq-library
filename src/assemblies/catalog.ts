import entries from '../data/assemblies.json'
import type { AssemblyEntry } from './types'
export const assemblies: AssemblyEntry[] = entries
export const assemblyForModel = (modelId: string) => assemblies.find(entry => entry.modelId === modelId)
export const assemblyById = (id: string) => assemblies.find(entry => entry.id === id)
