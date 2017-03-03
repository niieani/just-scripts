interface ENV {
  PATH? : string, Path? : string, [property : string] : string | undefined
}

declare module 'manage-path' {
  interface ManagePath {
    push(...paths : Array<string>)
    unshift(...paths : Array<string>)
    get() : string
    restore() : string
    // change(append : string | undefined, paths : Array<string>) : string
  }
  function managePath(env? : ENV, platform? : string) : ManagePath
  export = managePath
}

declare module 'manage-path/get-path-var' {
  function getPathVar(env : ENV, platform : string)
  export = getPathVar
}

declare module 'manage-path/get-separator' {
  function getSeparator(platform : string)
  export = getSeparator
}