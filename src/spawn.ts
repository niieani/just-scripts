import {spawn} from 'cross-spawn'
import * as supportsColor from 'supports-color'
import {adapt} from '@cycle/run/lib/adapt'
import xstream, {Stream} from 'xstream'
import fromEvent from 'xstream/extra/fromEvent'

import {ChildProcess, SpawnOptions} from 'child_process'
import * as treeKill from 'tree-kill'

/**
 * send from another driver (terminal-driver, initialized with args)
 * single-command definition (not the multi-command one, we parse that before)
 * that returns to the spawnSink: {id: ..., definition} or {id: ..., stdin: '...'}
 *
 * then from the spawn driver we can return observable with:
 * {id: ..., stderr: '...', stdout: '...'}
 *
 * then route back to terminal-driver:
 * {stderr: '...', stdout: '...'}
 */

export interface SpawnDefinition {
  id : any,
  idName? : string,
  meta? : any,
  command : string,
  args? : Array<string>,
  options? : SpawnOptions,
  once? : SpawnOnce,
  emit? : {
    onSuccess : Array<{type : ConditionType, id : IdType}>,
    onFail : Array<{type : ConditionType, id : IdType}>,
  }
}
export type IdType = Array<number | string>
export type ConditionType = 'success' | 'fail'

export interface SpawnOnce {
  type : ConditionType,
  allOf? : Array<IdType>,
  anyOf? : Array<IdType>,
  meta? : any,
}

export type CommandDefinitionStream = Stream<SpawnDefinition>

export interface CommandSpawnOutput {
  meta : any,
  console : string | Buffer,
  type : 'stdout' | 'stderr',
}

export type Signal = 'SIGHUP' | 'SIGINT' | 'SIGQUIT' | 'SIGILL' | 'SIGABRT' | 'SIGFPE' | 'SIGKILL' | 'SIGSEGV' | 'SIGPIPE' | 'SIGALRM' | 'SIGTERM' | 'SIGUSR1' | 'SIGUSR2' | 'SIGCHLD' | 'SIGCONT' | 'SIGSTOP' | 'SIGTSTP' | 'SIGTTIN' | 'SIGTTOU'

export interface CommandSpawnClose {
  type : 'close',
  code : number,
  signal : null | Signal,
}

export type CommandSpawnEmit = CommandSpawnOutput | CommandSpawnClose
export const forwardedSignals = ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP'] as Array<Signal>

export function makeSpawnDriver () {
  return function spawnDriver (commandsToStart$ : CommandDefinitionStream, name : string) {
    const runningProcesses = new Set<ChildProcess>()
    const output$ = xstream.create<CommandSpawnEmit>({
      start: function (listener) {
        commandsToStart$.subscribe({
          next: ({meta, command, args = [], options = {}}) => {
            // const options = {stdio: 'inherit', env}
            const proc = spawn(command, args, options)
            const getDataListener = (type : 'stdout' | 'stderr') =>
              (chunk : string | Buffer) => listener.next({meta, console: chunk.toString(), type})
            const stdoutListener = getDataListener('stdout')
            const stderrListener = getDataListener('stderr')
            const errorListener = (err) => listener.error(err)
            // https://nodejs.org/api/child_process.html#child_process_class_childprocess
            // proc.stdout.setEncoding('utf8')
            proc.stdout.on('data', stdoutListener)
            proc.stderr.on('data', stderrListener)
            proc.on('error', errorListener)
            proc.on('error', errorListener)
            proc.on('close', (code, signal : null | Signal) => {
              listener.next({meta, code, signal, type: 'close'})
              proc.stdout.removeListener('data', stdoutListener)
              proc.stderr.removeListener('data', stderrListener)
              proc.removeListener('error', errorListener)
              runningProcesses.delete(proc)
            })
            runningProcesses.add(proc)

            const getSignalForwarder = (signal : Signal) => () => runningProcesses.forEach(child => treeKill(child.pid, signal))
            forwardedSignals.forEach(signal => process.on(signal, getSignalForwarder(signal)))
          },
          error: (e) => undefined,
          complete: () => listener.complete()
        })
      },

      stop: function () {
        runningProcesses.forEach(proc => proc.kill())
      }
    })

    return adapt(output$)
    // const source = {
    //   command (query) {
    //     const response$ = xstream.fromArray(['hello', 'yo'])
    //     return adapt(response$)
    //   }
    // }
    // return source
  }
}

// export function spawn

// if (IS_WINDOWS) {
//     spawnOpts.detached = false;
// }
// if (supportsColor) {
//   spawnOpts.env = Object.assign({FORCE_COLOR: supportsColor.level}, process.env)
// }
// const envVars = Object.assign({}, process.env)
// const proc = spawn(command, commandArgs, {stdio: 'inherit', env});
// process.on('SIGTERM', () => proc.kill('SIGTERM'));
// process.on('SIGINT', () => proc.kill('SIGINT'));
// process.on('SIGBREAK', () => proc.kill('SIGBREAK'));
// process.on('SIGHUP', () => proc.kill('SIGHUP'));
// proc.on('exit', process.exit);
// return proc
