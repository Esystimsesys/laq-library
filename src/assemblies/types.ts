export type AssemblyEntry = {
  id: string; modelId: string; title: string; revision: number
  defaultVariant: string; unitCount: number; pieceCount: number; guidePath: string
}
export type PartNo = number | 'mini-shaft' | 'mini-wheel'
export type Piece = { id: string; partNo: PartNo; color: string }
export type GuideStep = {
  title: string; description?: string; visiblePieces: string[]; newPieces: string[]
  presentation?: string; explodeGroups?: string[][]; inputs?: string[]; result?: string
}
export type Unit = { id: string; label: string; pieceIds: string[]; steps: GuideStep[] }
export type Variant = { units: Unit[]; assembly: GuideStep[]; model: { pieces: Piece[] }; finished: string }
export type Guide = {
  defaultVariant: string; variants: Record<string, Variant>; article: string
  sequence?: string[]; legacyAtKeys?: string[]; displayLabels?: Record<string, string>
  reading?: {
    unitNames?: Record<string, string>
    stepGroups?: { id: string; title: string; keys: string[]; explodeGroups?: string[][] }[]
  }
}
export type JourneyStep = {
  key: string; phase: 'welcome' | 'group' | 'unit' | 'assembly' | 'done'
  unit?: string; step: number; title: string; description: string; source?: GuideStep
}
