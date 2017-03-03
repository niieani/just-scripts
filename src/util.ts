import * as commandStringToArgv from 'string-argv'
import {uniq, takeWhile} from 'ramda'
import {sync as findUpSync} from 'find-up'

export function getCommandFromString(command : string) {
  // TODO: add parsing &&, || and ;
  const commandBits = command.split(' ')
  const envAsStrings = takeWhile(part => part.indexOf('=') > 0, commandBits)
  const env = envAsStrings.reduce((obj, envAsString) => {
    const [variable, value] = envAsString.split('=')
    // TODO: check for PATH and replace with platform-specific var-name
    return Object.assign(obj, {[variable]: value})
  }, {})
  const executable = commandBits[envAsStrings.length]
  const argvString = commandBits.slice(envAsStrings.length + 1).join(' ')
  const args = commandStringToArgv(argvString)
  return {
    args,
    executable,
    env,
  }
}

export const pathSeparator = process.platform === 'win32' ? ';' : ':'
export interface ENV {PATH? : string, Path? : string, [property : string] : string | undefined}
export function getPathVar(env? : ENV, platform = process.platform) {
  if (platform !== 'win32') {
    return 'PATH'
  }
  return env && Object.keys(env).find(key => !!key.match(/PATH/i)) || 'Path'
}
export function getEnvWithBin(env : ENV = process.env) : ENV {
  const binDir : string = findUpSync('node_modules/.bin')
  if (binDir) {
    const pathVar = getPathVar(env)
    const newPath = env[pathVar] ? `${binDir}${pathSeparator}${env[pathVar]}` : binDir
    return {...env, [pathVar]: newPath}
  }
  return env
}

export function getPathArray(env = {} as ENV) {
  const pathVar = getPathVar(env)
  if (env[pathVar]) {
    return (env[pathVar] as string).split(pathSeparator)
  }
  return []
}

export function mergeEnvPreservingPaths(...env : Array<{PATH? : string, Path? : string, [property : string] : string | undefined} | undefined>) {
  const paths = env.map(o => getPathArray(o))
  const flatPaths = ([] as Array<string>).concat(...paths)
  const uniquePaths = uniq(flatPaths)
  const pathVarName = getPathVar()
  return Object.assign({}, ...env, {
    [pathVarName]: uniquePaths.join(pathSeparator)
  })
}