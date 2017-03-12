import {spawn} from 'cross-spawn'
import * as supportsColor from 'supports-color'
import {adapt} from '@cycle/run/lib/adapt'
import xstream, {Stream} from 'xstream'
import fromEvent from 'xstream/extra/fromEvent'

import {ChildProcess, SpawnOptions} from 'child_process'
import treeKill = require('tree-kill')

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
  definition? : any,
}

export interface ProcessControl {
  type: 'spawn' | 'kill'
  definition : SpawnDefinition
  signal? : Signal
}

// export type CommandDefinitionStream = Stream<SpawnDefinition>
export type ProcessControlStream = Stream<ProcessControl>

export interface CommandDriverOutput {
  definition : SpawnDefinition,
}

export interface CommandSpawnOutput extends CommandDriverOutput {
  console : string | Buffer,
  type : 'stdout' | 'stderr',
}

export type Signal = 'SIGHUP' | 'SIGINT' | 'SIGQUIT' | 'SIGILL' | 'SIGABRT' | 'SIGFPE' | 'SIGKILL' | 'SIGSEGV' | 'SIGPIPE' | 'SIGALRM' | 'SIGTERM' | 'SIGUSR1' | 'SIGUSR2' | 'SIGCHLD' | 'SIGCONT' | 'SIGSTOP' | 'SIGTSTP' | 'SIGTTIN' | 'SIGTTOU'

export interface CommandSpawnOpen extends CommandDriverOutput {
  type : 'open',
  process : ChildProcess,
}

export interface CommandSpawnClose extends CommandDriverOutput {
  type : 'close',
  code : number,
  signal : null | Signal,
}

export interface CommandSpawnKilled extends CommandDriverOutput {
  type : 'killed'
  signal : Signal
  process : ChildProcess
}

export type CommandSpawnEmit = CommandSpawnOutput | CommandSpawnClose | CommandSpawnOpen | CommandSpawnKilled
export const forwardedSignals = ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP'] as Array<Signal>

export function makeSpawnDriver () {
  return function spawnDriver (processControl$ : ProcessControlStream, name : string) {
    // const runningProcesses = new Set<ChildProcess>()
    const runningProcesses = new Map<SpawnDefinition, ChildProcess>()
    const killAll = (signal : Signal) => runningProcesses.forEach(child => treeKill(child.pid, signal))
    const output$ = xstream.create<CommandSpawnEmit>({
      start: function (listener) {
        processControl$.subscribe({
          next: (processAction) => {
            switch (processAction.type) {
              case 'spawn': {
                const {definition} = processAction
                const {command, args = [], options = {}} = definition
                // TODO: const options = {stdio: 'inherit', env}
                const process = spawn(command, args, options)
                listener.next({definition, type: 'open', process})
                const getDataListener = (type : 'stdout' | 'stderr') =>
                  (chunk : string | Buffer) => listener.next({definition, console: chunk.toString(), type})
                const stdoutListener = getDataListener('stdout')
                const stderrListener = getDataListener('stderr')
                const errorListener = (err) => listener.error(err)
                // https://nodejs.org/api/child_process.html#child_process_class_childprocess
                // proc.stdout.setEncoding('utf8')
                process.stdout.on('data', stdoutListener)
                process.stderr.on('data', stderrListener)
                process.on('error', errorListener)
                process.on('error', errorListener)
                process.on('close', (code, signal : null | Signal) => {
                  listener.next({definition, code, signal, type: 'close'})
                  process.stdout.removeListener('data', stdoutListener)
                  process.stderr.removeListener('data', stderrListener)
                  process.removeListener('error', errorListener)
                  runningProcesses.delete(definition)
                })
                runningProcesses.set(definition, process)

                const getSignalForwarder = (signal : Signal) => () => runningProcesses.forEach(child => treeKill(child.pid, signal))
                forwardedSignals.forEach(signal => process.on(signal, getSignalForwarder(signal)))
                break
              }
              case 'kill': {
                const {definition, signal = 'SIGTERM'} = processAction
                const process = runningProcesses.get(processAction.definition)
                if (process) {
                  treeKill(process.pid, signal, (error : Error) => error ?
                    listener.error({type: 'killed', definition, signal, process, error}) :
                    listener.next({type: 'killed', definition, signal, process})
                  )
                }
                break
              }
              default:
            }
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
