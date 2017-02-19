declare module 'interpret' {
  export type ModuleDescriptor = ModuleDefinition | Array<ModuleDefinition> | string | Array<string> | null
  export interface ModuleDefinition {
    module: string
    register: (module: any) => void
  }
  export const extensions: {
    [extensions: string]: ModuleDescriptor
  }
}
