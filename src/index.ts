import xs, {Stream, MemoryStream} from 'xstream'
import {run} from '@cycle/run'
import {makeSpawnDriver, SpawnDefinition, CommandSpawnEmit, SpawnOnce} from './spawn'
import {makeTerminalDriver, TerminalLogDefinition, TerminalEmit} from './terminal'
import { CommandDefinition, CommandDefinitionArray, ChainType, WithSingleTask, WithEnv, WithChainTask } from './definition'
import {getCommandFromString} from './util'
import * as crossPathEnv from 'npm-path'
import {uniq} from 'ramda'
// WithSubCommand,
// import {adapt} from '@cycle/run/lib/adapt'

import * as fs from 'fs'
import * as path from 'path'

interface Sources {
  commands$ : Stream<CommandSpawnEmit>,
  terminal$ : Stream<TerminalEmit>,
  // commandDefinition$ : Stream<WithSubCommand>,
}

interface Sinks {
  commands$ : Stream<SpawnDefinition>,
  terminal$ : Stream<TerminalLogDefinition>,
}

type filter<T, TOut> = (callbackfn: (value: T, index: number, array: T[]) => any, thisArg?: any) => TOut[]

function mergeEnvPreservingPaths(...env : Array<{env? : string, [property : string] : string | undefined} | undefined>) {
  let finalPath = ''
  const paths = (env.filter as filter<typeof env[0], {env : string}>)(o => !!o && !!o.env)
    .map(o => o.env[crossPathEnv.PATH] ? o.env[crossPathEnv.PATH].split(crossPathEnv.SEPARATOR) : [])
  const flatPaths = ([] as Array<string>).concat(...paths).reverse()
  const uniquePaths = uniq(flatPaths)
  return Object.assign({}, ...env, {
    [crossPathEnv.PATH]: uniquePaths.join(crossPathEnv.SEPARATOR)
  })
}

function chainDefinitions(definitions : Array<SpawnDefinition>, logic : ChainType = 'and', groupPath : Array<string | number> = [], chainDependency? : SpawnOnce) {
  switch (logic) {
    default:
    case 'and' || 'or':
      return definitions.map((current, idx, arr) => ({
        ...current,
        ...(current.once ? {once: current.once} :
          (chainDependency || idx !== 0) ? {
            once: idx === 0 ? chainDependency :
              logic === 'and' ?
                {logic, type: 'success', allOf: [arr[idx - 1].id]} :
                {logic, type: 'fail', allOf: [arr[idx - 1].id]}
          } : {}),
        emit: {
          onSuccess: uniq([
            ...(current.emit && current.emit.onSuccess || []),
            // {type: 'success', id: current.id}, // current.meta.groupPath
            // ...[(logic === 'or' || idx === arr.length - 1) ? [{type: 'group:success', ids: definitions.map(d => d.id)}] : []]
            ...((groupPath.length && (logic === 'or' || idx === arr.length - 1)) ? [{type: 'success', id: groupPath}] : [])
          ]),
          onFail: uniq([
            ...(current.emit && current.emit.onFail || []),
            // {type: 'fail', id: current.id},
            // ...[(logic === 'and' || idx === arr.length - 1) ? [{type: 'group:fail', ids: definitions.map(d => d.id)}] : []]
            ...((groupPath.length && (logic === 'and' || idx === arr.length - 1)) ? [{type: 'fail', id: groupPath}] : [])
          ])
        }
        // ...((logic === 'or' || idx === arr.length - 1) ? {completesChain: definitions} : {})
      } as SpawnDefinition))
    case 'concurrent':
      return definitions
  }
}

// export function convertCommandDefinitionToSpawnDefinition(name : string, descriptor : CommandDefinition, parentEnv = {}, additionalArgs = [], chainType : ChainType = 'and', once? : SpawnOnce, depth = 0, groupPath : Array<string | number> = []) {

// }

export function convertCommandToSpawnDefinition(name : string, descriptor : CommandDefinition, parentEnv = {}, additionalArgs = [], chainType : ChainType = 'and', chainDependency? : SpawnOnce, depth = 0, groupPath : Array<string | number> = [name]) : {chainType: ChainType, tasks: Array<SpawnDefinition>, groupPath: Array<string | number>} {
  if (Array.isArray(descriptor)) {
    const definitions = [] as Array<SpawnDefinition>
    // let prevChainType = 'and'
    let prevGroupPath : Array<number | string> | undefined = undefined
    descriptor.forEach(
      (definition, i) => {
        // const lastOnce = index === 0 ? once : {type: 'success', meta: descriptor[index - 1]} as SpawnOnce
        // const lastOnce = index === 0 ? once : {type: 'success', meta: descriptor[index - 1]} as SpawnOnce
        // do not set any once in the nested Array yet:
        // const nextOnce : SpawnOnce = index === 0 ? {type: 'success', group: groupPath} : once
        // const previousDefinition = i > 0 ? descriptor[i - 1] : undefined
        // if (previousDefinition && previousDefinition.chainType) {
        //   previousDefinition.chainType
        // }
        const {chainType: thisChainType = 'and', tasks: innerDefinitions, groupPath: thisGroupPath} = convertCommandToSpawnDefinition(name, definition, parentEnv, additionalArgs, /* this will be used by SUBCOMMANDS */ undefined, undefined, depth, [...groupPath, i + 1])
        // debugger
        // once = once || {type: 'success', group: thisGroupPath}

        // now set it gluing it to the parent
        definitions.push(...chainDefinitions(innerDefinitions, chainType, thisGroupPath, chainDependency || (prevGroupPath ? ({type: chainType === 'and' ? 'success' : 'fail', allOf: [prevGroupPath]}) : undefined)))
        prevGroupPath = thisGroupPath
      }
    )
    // return {chainType, tasks: definitions, groupPath}
    return {chainType, tasks: chainDefinitions(definitions, chainType, groupPath, chainDependency), groupPath}
    // return chainDefinitions(definitions, chainType, once, groupPath)
  }
  if (typeof descriptor === 'string') {
    descriptor = {command: descriptor}
  }
  const withEnv = descriptor as WithEnv
  const preferLocalEnv = !withEnv.hasOwnProperty('preferLocal') || withEnv.preferLocal
  const envFile = {}
  if (withEnv.envFile) {
    throw new Error('envFile parsing not implemented yet')
  }
  const mergedEnv = mergeEnvPreservingPaths(
    preferLocalEnv ? {...process.env, [crossPathEnv.PATH]: crossPathEnv.get()} : process.env,
    parentEnv,
    withEnv.env,
  )

  const withSingleTask = descriptor as WithSingleTask
  if (withSingleTask.command) {
    const {args: argsFromCommand, executable: command, env: envFromCommand} = getCommandFromString(withSingleTask.command)
    const env = mergeEnvPreservingPaths(
      mergedEnv,
      envFromCommand,
    )
    const args = [...argsFromCommand, ...additionalArgs]
    if (command === 'command4') { debugger }
    return {
      chainType,
      groupPath,
      tasks: [{
        meta: {
          name,
          depth,
          chainType,
          command,
          args,
          groupPath,
          // descriptor,
        },
        args,
        command,
        options: {
          env,
        },
        // without once, we run immediately (it's like: triggerOn)
        ...(chainDependency ? {chainDependency} : {}),
        id: groupPath,
        idName: `${groupPath.join(' > ')} | ${chainType} | ${command} ${args.join(' ')}`,
      }]
    }
  }
  const withChainTask = descriptor as WithChainTask
  if (Array.isArray(withChainTask.chain)) {
    return convertCommandToSpawnDefinition(name, withChainTask.chain, mergedEnv, additionalArgs, withChainTask.chainType, chainDependency, depth + 1, [...groupPath, withChainTask.chainType || 'and'])
  }
  return {
    chainType,
    tasks: [],
    groupPath,
  }
}

export default function start(commandDefinition : CommandDefinition) {
  function main ({commands$, terminal$} : Sources) : Sinks {
    const inputCommand$ = xs.fromArray([
      {id : '1', command : 'bash', args: ['-c', 'echo START1 && sleep 3 && echo END1']},
      {id : '2', command : 'bash', args: ['-c', 'echo START2 && sleep 1 && echo END2']}
    ])

    // const mirrorInput = terminal$.map(io => ({log: ' :: ' + io.stdin.toString()}))

    const terminalOutput$ = commands$
      .map(c => ({log: JSON.stringify(c) + '\n'}))

    return {
      commands$: inputCommand$,
      // terminal$: xs.merge(terminalOutput$, mirrorInput),
      terminal$: terminalOutput$,
    }
  }
  return run(main, {
    commands$: makeSpawnDriver(),
    terminal$: makeTerminalDriver(),
    // commandDefinition$: () => adapt(xs.fromArray([commands]))
  })
}
