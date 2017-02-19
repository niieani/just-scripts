import xstream, {Stream} from 'xstream'
import {adapt} from '@cycle/run/lib/adapt'
// import * as readline from 'readline'

export type TerminalLogDefinition = {
  log : string | Buffer,
  target? : 'stdout' | 'stderr',
}

export type TerminalEmit = {
  stdin : string | Buffer,
}

export function makeTerminalDriver() {
  return function terminalDriver(io$ : Stream<TerminalLogDefinition>, name : string) {
    const subscription = io$.subscribe({
      next: ({log, target = 'stdout'}) => {
        process[target].write(log)
      },
      error: (e) => console.error(e),
      complete: () => undefined,
    })
    const output$ = xstream.create<TerminalEmit>({
      start: function (listener) {
        // const rl = readline.createInterface({
        //   input: process.stdin,
        //   output: process.stdout
        // })
        // rl.on('SIGINT', function () {
        //   console.log('hello')
        //   // process.emit('SIGINT')
        // })
        // (process.stdin as any).setRawMode(true)
        // ;(readline as any).emitKeypressEvents(process.stdin)
        // process.stdin.setEncoding('utf8')
        // process.stdin.on('keypress', function(char, key) {
        //   if (key && key.ctrl && key.name === 'c') {
        //     // Behave like a SIGUSR2
        //     process.emit('SIGUSR2')
        //   } else if (key && key.ctrl && key.name === 'r') {
        //     // Behave like a SIGHUP
        //     process.emit('SIGHUP')
        //   }
        // })
        process.stdin.on('readable', () => {
          const stdin = process.stdin.read()
          if (stdin !== null) {
            listener.next({stdin})
          }
        })

        process.stdin.on('end', () => {
          listener.complete()
        })
      },
      stop: function () {
        subscription.unsubscribe()
      }
    })

    return adapt(output$)
  }
}