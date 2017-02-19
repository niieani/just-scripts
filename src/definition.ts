export type CommandDefinition = string | TaskConfiguration | CommandDefinitionArray
export type CommandDefinitionArray = Array<string | TaskConfiguration>

export interface WithSingleTask {
  command? : string,
}

export type ChainType = 'and' | 'or' | 'concurrent'

export interface WithChainTask {
  chain? : Array<CommandDefinition>,
  chainType? : ChainType,
}

export type ConcurrentlyOptions = 'kill-others'

export interface WithConcurrentTask {
  concurrently? : Array<CommandDefinition>,
  options? : Array<ConcurrentlyOptions>,
}

export interface WithEnv {
  env? : {
    [variableName : string] : string
  },
  envFile? : string,
  preferLocal? : boolean, // defaults to true
}


export interface WithSubCommand {
  [subcommand : string] : CommandDefinition
}

export type TaskConfiguration = WithEnv & (WithConcurrentTask | WithChainTask | WithSingleTask)

const a : TaskConfiguration = {
  env: {
    one: '123'
  },
  command: 'webpack'
}

// just clean
// just --something=thing webpack --whatever

// .goscripts.json
// .goscripts
// .goscripts.js
// .goscripts.ts
// package.json -> goScripts: {}

export const example : WithSubCommand = {
  'webpack': {
    env: {NODE_ENV: 'production'},
    command: 'webpack --env production'
  },
  'clean': {
    chain: [
      'rm thing.json',
      'go webpack',
      {command: 'npm', env: {THING: 'yep'}},
      'echo awesome'
    ]
  },
  'e2es': [
    'go clean',
    { concurrently: ['go webpack', 'go e2e'], options: ['kill-others'] }
  ],
  'e2e': {
    envFile: '.env',
    chain: [
      'go clean',
      { concurrently: ['go webpack', 'go e2e'], options: ['kill-others'] }
    ]
  }
}

/**
 * maybe instead of "chain" and "chainType"
 * specify the type as the keyName
 * and: ['echo 1', 'echo 2']
 * or: ['false', 'echo yes']
 * together: ['echo 1', 'echo2']
 *
 * add to definition:
 * once: {
 *   portOpen: ['80']
 * }
 */

/**
 * go scripts / just scripts
 *
 * features:
 * - always uses local install
 * - setting env
 * - cross-platform
 * - run concurrently
 * - run chain
 * - invoking other scripts without re-executing it all
 */
