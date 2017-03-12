import xs, {Stream, MemoryStream} from 'xstream'
import {run} from '@cycle/run'
import {makeSpawnDriver, SpawnDefinition, ProcessControl, CommandSpawnEmit, SpawnOnce} from './spawn'
import {makeTerminalDriver, TerminalLogDefinition, TerminalEmit} from './terminal'
import { CommandDefinition, CommandDefinitionArray, ChainType, WithSubCommand, WithSingleTask, WithEnv, WithChainTask } from './definition'
import {getCommandFromString, mergeEnvPreservingPaths, getEnvWithBin} from './util'
import {uniq, difference, equals} from 'ramda'
import sampleCombine from 'xstream/extra/sampleCombine'
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
  commands$ : Stream<ProcessControl>,
  terminal$ : Stream<TerminalLogDefinition>,
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
    preferLocalEnv ? getEnvWithBin() : process.env,
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

// [1, 2, 3]; [2, 3, 4]
// anyOf: [[1, 2, 3]]

export default function start(commandDefinition : CommandDefinition) {
  const {tasks} = convertCommandToSpawnDefinition('main', commandDefinition)
  // console.log(tasks)
  function main ({commands$, terminal$} : Sources) : Sinks {
    const inputCommand$ = xs.fromArray(tasks)
    const unconditionalCommand$ = inputCommand$.filter(t => !t.once)
    const conditionalCommand$ = inputCommand$.filter(t => !!t.once)

    const conditionalCommands$ = conditionalCommand$
      .fold((acc, t) => [...acc, t], [] as Array<SpawnDefinition>)

    // const mirrorInput = terminal$.map(io => ({log: ' :: ' + io.stdin.toString()}))

    const started$ = commands$
      .filter(c => c.type === 'open')
      .map(c => c.definition)
      .fold((acc, t) => [...acc, t], [] as Array<SpawnDefinition>)

    const successful$ = commands$
      .filter(c => c.type === 'close' && c.code === 0)
      .map(c => c.definition)

    const failed$ = commands$
      .filter(c => c.type === 'close' && c.code > 0)
      .map(c => c.definition)

    const endedCommand$ = xs.merge(successful$, failed$)

    const endedCommands$ = endedCommand$
      .fold((acc, t) => [...acc, t], [] as Array<SpawnDefinition>)

    const notStartedConditionalCommands$ = xs
      .combine(started$, conditionalCommands$)
      .map(([startedCommands, conditionalCommands]) =>
        difference(conditionalCommands, startedCommands))

    const reactions$ = commands$
      .filter(c => c.type === 'close' && !!c.definition.emit)
      .map(c => xs.fromArray(c.type === 'close' && !!c.definition.emit &&
        (
          (c.code === 0 && c.definition.emit.onSuccess)
          ||
          (c.code > 0 && c.definition.emit.onFail)
        ) || []
      ))
      .flatten()

    const markedAsSuccessfulIds$ = reactions$
      .filter(c => c.type === 'success')
      .fold((acc, t) => [...acc, t.id], [] as Array<Array<number | string>>)

    const markedAsFailedIds$ = reactions$
      .filter(c => c.type === 'fail')
      .fold((acc, t) => [...acc, t.id], [] as Array<Array<number | string>>)

    const markedAsFailed$ = xs
      .combine(started$, markedAsFailedIds$)
      .map(([started, failedIds]) =>
        started.filter(({id}) =>
          failedIds.some(failedId => equals(failedId, id))
        )
      )

    const stillRunningMarkedAsFailed$ = xs
      .combine(markedAsFailed$, endedCommands$)
      .map(([failed, ended]) => xs.fromArray(
        difference(failed, ended)
      ))
      .flatten()

    const conditionalCommandsToStartNow$ = xs
      .combine(markedAsSuccessfulIds$, notStartedConditionalCommands$)
      .map(([successfulIds, notStarted]) =>
        xs.fromArray(notStarted
          .filter(command =>
            command.once &&
            (
              (
                command.once.anyOf &&
                command.once.anyOf.some(id => successfulIds.some(sId => equals(id, sId)))
              )
              ||
              (
                command.once.allOf &&
                command.once.allOf.every(id => successfulIds.some(sId => equals(id, sId)))
              )
            )
          )
        )
      )
      .flatten()

    const terminalOutput$ = commands$
      .filter(c => c.type === 'stdout' || c.type === 'stderr')
      .map(c => ({log: JSON.stringify((c.type === 'stdout' || c.type === 'stderr') && c.console) + '\n'}))

    const commandsToSpawn$ = xs
        .merge(unconditionalCommand$, conditionalCommandsToStartNow$)
        .map(definition => ({type: 'spawn', definition} as ProcessControl))

    const commandsToKill$ = stillRunningMarkedAsFailed$
      .map(definition => ({type: 'kill', definition} as ProcessControl))

    return {
      commands$: xs.merge(commandsToSpawn$, commandsToKill$),
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
