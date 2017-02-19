declare module 'cross-spawn' {
  import * as childProcess from 'child_process'
  export const spawn : typeof childProcess.spawn
}