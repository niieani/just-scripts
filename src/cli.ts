#!/usr/bin/env node

import * as yargs from 'yargs'
import * as path from 'path'
import * as fs from 'fs'
import {WithSubCommand} from './definition'
import {extensions, ModuleDescriptor} from 'interpret'
import start from './index'

export interface PackageJson {
  scripts? : {
    [name : string] : string
  }
  justScripts? : WithSubCommand
  version? : string,
  [property : string] : any
}

function loadPackageJson() {
  const filePath = path.resolve('package.json')
  try {
    return require(filePath) as PackageJson
  } catch (_) {
    console.error(`${filePath}n not found or not accessible in directory`)
  }
}

function registerCompiler(moduleDescriptor : ModuleDescriptor) {
  if (!moduleDescriptor) {
    return
  }
  if (typeof moduleDescriptor === 'string') {
    require(moduleDescriptor)
  } else if (!Array.isArray(moduleDescriptor)) {
    moduleDescriptor.register(require(moduleDescriptor.module))
  } else {
    for (let i = 0; i < moduleDescriptor.length; i++) {
      try {
        registerCompiler(moduleDescriptor[i])
        break
      } catch (_) {
        // nothing
      }
    }
  }
}

const extensionLoaders = Object.keys(extensions)
  .map(extension => ({
    extension,
    definition: extensions[extension]
  }))
  .sort(a => a.definition === null ? 1 : -1)

type ConfigResolver<T> = T | Promise<T> | ((env : Object) => (T | Promise<T>))
type ConfigResolverDefaultExport<T> = {default : ConfigResolver<T>}
type ConfigResolverModule<T> = ConfigResolver<T> | ConfigResolverDefaultExport<T>

async function tryLoadModule<T>(filename : string, iteration : number = 0, stopBeforeIndex = extensionLoaders.length) : Promise<T | undefined> {
  const loader = extensionLoaders[iteration]
  const pathToTry = path.resolve(`${filename}${loader.extension}`)
  const exists = await new Promise<fs.Stats | undefined>((resolve, reject) =>
    fs.stat(pathToTry, (err, value) => err ? resolve() : resolve(value)))
  if (exists) {
    try {
      registerCompiler(loader.definition)
      return require(pathToTry) as T
    } catch (_) { /* continue */ }
  }
  const nextIteration = iteration + 1
  return stopBeforeIndex > nextIteration ? await tryLoadModule<T>(filename, nextIteration) : undefined
}

async function tryLoadConfig(requiredModule : ConfigResolverModule<WithSubCommand> | undefined, tryDefault = true) : Promise<WithSubCommand> {
  if (typeof requiredModule === 'function') {
    // function returning object or promise
    return await requiredModule(process.env)
  }
  if (typeof requiredModule === 'object') {
    const {default : defaultExport} = requiredModule as ConfigResolverDefaultExport<WithSubCommand>
    if (tryDefault && defaultExport) {
      return await tryLoadConfig(defaultExport, false)
    } else {
      return await requiredModule
    }
  }
  return {}
}

async function run() {
  const configModule = await tryLoadModule<ConfigResolverModule<WithSubCommand>>('just-scripts')
  const moduleConfig = configModule ? await tryLoadConfig(configModule) : {}
  const packageJson = loadPackageJson() || {}
  const {version} = packageJson
  const config : WithSubCommand = {...packageJson.scripts, ...packageJson.justScripts, ...moduleConfig}

  const argv = process.argv.slice(2)
  const lastArgumentBeforeCommandIndex = argv.findIndex(arg => !!arg.match(/^(?!-)/i)) + 1 || process.argv.length
  const internalArgv = argv.slice(0, lastArgumentBeforeCommandIndex)
  const passAlongArgv = argv.slice(lastArgumentBeforeCommandIndex)
  // console.log(internalArgv, passAlongArgv)

  const coerceEnv = (opt : string | Object) => typeof opt === 'string' ? {NODE_ENV: opt} : opt

  yargs.options({
    env: {
      nargs: 1,
      coerce: coerceEnv, // TODO: why doesn't this work?
      describe: 'Environment to set. Use multiple times to define arbitrary ENV, like: --env.NODE_ENV=production --env.DEBUG=true'
    }
  })

  Object.keys(config).forEach(command => {
    const commandDefinition = config[command]
    yargs.command({
      command,
      describe: '',
      handler: (internalArguments) => {
        internalArguments = internalArguments.env ? {...internalArguments, env: coerceEnv(internalArguments.env)} : internalArguments
        const {env} = internalArguments
        console.log(env, commandDefinition, passAlongArgv)
        start(commandDefinition)
      }
    })
  })

  const args = yargs
    .help()
    .version(version)
    .demandCommand(1, 'You need to specify a command name')
    .recommendCommands()
    .parse(internalArgv)
}

run()
