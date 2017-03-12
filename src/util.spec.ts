import {convertCommandToSpawnDefinition} from './index'
// import {example} from './definition'
import {SpawnDefinition, SpawnOnce} from './spawn'
import {omit} from 'ramda'

function cleanEnvForTest(definitions : Array<SpawnDefinition>) {
  return definitions.map(d => omit(['options', 'meta'], d))
}

function cleanSpawnForTest(spawnTrigger? : SpawnOnce) {
  return spawnTrigger ? {...spawnTrigger, meta: omit(['trigger', 'meta', 'options'], spawnTrigger.definition)} : undefined
}

describe('convertCommandToSpawnDefinition', () => {
  test('AND chain commands', () => {
    const definition = [
      'command1 arg1 arg2 arg3',
      'command2 arg1 arg2 arg3',
      {command: 'command3 arg1 arg2 arg3', env: {ENV: 'ENV1'}},
      'command4 arg1 arg2 arg3'
    ]
    const {tasks: chained} = convertCommandToSpawnDefinition('test', definition)
    const cleaned = cleanEnvForTest(chained)
    expect(cleaned).toBeDefined()
    // console.log(cleaned)
    expect(cleaned.length).toBe(4)
  })
  test('OR chain commands', () => {
    const definition = {
      chain: [
        'command1 arg1 arg2 arg3',
        'command2 arg1 arg2 arg3',
        {command: 'command3 arg1 arg2 arg3', env: {ENV: 'ENV1'}},
        'command4 arg1 arg2 arg3'
      ],
      chainType: 'or',
    }
    const {tasks: chained} = convertCommandToSpawnDefinition('test', definition)
    const cleaned = cleanEnvForTest(chained)
    expect(cleaned).toBeDefined()
    // console.log(cleaned)
    expect(cleaned.length).toBe(4)
  })
  test('CONCURRENT chain commands', () => {
    const definition = {
      chain: [
        'command1 arg1 arg2 arg3',
        'command2 arg1 arg2 arg3',
        {command: 'command3 arg1 arg2 arg3', env: {ENV: 'ENV1'}},
        'command4 arg1 arg2 arg3'
      ],
      chainType: 'concurrent',
    }
    const {tasks: chained} = convertCommandToSpawnDefinition('test', definition)
    const cleaned = cleanEnvForTest(chained)
    expect(cleaned).toBeDefined()
    // console.log(cleaned)
    expect(cleaned.length).toBe(4)
  })

  test('AND chain nested AND commands', () => {
    const definition = [
      'command1 arg1 arg2 arg3',
      {chain: ['command2 2-arg1 2-arg2 2-arg3', '3-command3']},
      {command: 'command4 4-arg1 4-arg2 4-arg3', env: {ENV: 'ENV1'}},
      'command5 5-arg1 5-arg2 5-arg3'
    ]
    const {tasks: chained} = convertCommandToSpawnDefinition('test', definition)
    const cleaned = cleanEnvForTest(chained)
    expect(cleaned).toBeDefined()
    // console.dir(cleaned.map(c => cleanSpawnForTest(c.once)), {depth: 5})
    const expectedTriggers = [ undefined,
      { type: 'success', allOf: [ [ 'test', 1 ] ], meta: {} },
      { type: 'success', allOf: [ [ 'test', 2, 'and', 1 ] ], meta: {} },
      { type: 'success', allOf: [ [ 'test', 2, 'and' ] ], meta: {} },
      { type: 'success', allOf: [ [ 'test', 3 ] ], meta: {} } ]
    expect(cleaned.length).toBe(5)
    expect(cleaned.map(c => cleanSpawnForTest(c.once))).toEqual(expectedTriggers)
  })

  test('AND chain nested OR commands', () => {
    const definition = [
      'command1 arg1 arg2 arg3',
      {
        chain: ['command2 2-arg1 2-arg2 2-arg3', 'or 3-arg1'],
        chainType: 'or'
      },
      {command: 'command4 4-arg1 4-arg2 4-arg3', env: {ENV: 'ENV1'}},
      'command5 5-arg1 5-arg2 5-arg3'
    ]
    const {tasks: chained} = convertCommandToSpawnDefinition('test', definition)
    const cleaned = cleanEnvForTest(chained)
    expect(cleaned).toBeDefined()
    // console.dir(cleaned, {depth: 5})
    const expected = [ { args: [ 'arg1', 'arg2', 'arg3' ],
      command: 'command1',
      id: [ 'test', 1 ],
      idName: 'test > 1 | and | command1 arg1 arg2 arg3',
      emit:
      { onSuccess: [ { type: 'success', id: [ 'test', 1 ] } ],
        onFail:
        [ { type: 'fail', id: [ 'test', 1 ] },
          { type: 'fail', id: [ 'test' ] } ] } },
      { args: [ '2-arg1', '2-arg2', '2-arg3' ],
        command: 'command2',
        id: [ 'test', 2, 'or', 1 ],
        idName: 'test > 2 > or > 1 | and | command2 2-arg1 2-arg2 2-arg3',
        emit:
        { onSuccess:
        [ { type: 'success', id: [ 'test', 2, 'or', 1 ] },
          { type: 'success', id: [ 'test', 2, 'or' ] } ],
          onFail:
          [ { type: 'fail', id: [ 'test', 2, 'or', 1 ] },
            { type: 'fail', id: [ 'test', 2, 'or' ] },
            { type: 'fail', id: [ 'test' ] } ] },
        once: { type: 'success', allOf: [ [ 'test', 1 ] ] } },
      { args: [ '3-arg1' ],
        command: 'or',
        id: [ 'test', 2, 'or', 2 ],
        idName: 'test > 2 > or > 2 | and | or 3-arg1',
        once: { type: 'fail', allOf: [ [ 'test', 2, 'or', 1 ] ] },
        emit:
        { onSuccess:
        [ { type: 'success', id: [ 'test', 2, 'or', 2 ] },
          { type: 'success', id: [ 'test', 2, 'or' ] } ],
          onFail:
          [ { type: 'fail', id: [ 'test', 2, 'or', 2 ] },
            { type: 'fail', id: [ 'test', 2, 'or' ] },
            { type: 'fail', id: [ 'test' ] } ] } },
      { args: [ '4-arg1', '4-arg2', '4-arg3' ],
        command: 'command4',
        id: [ 'test', 3 ],
        idName: 'test > 3 | and | command4 4-arg1 4-arg2 4-arg3',
        once: { type: 'success', allOf: [ [ 'test', 2, 'or' ] ] },
        emit:
        { onSuccess: [ { type: 'success', id: [ 'test', 3 ] } ],
          onFail:
          [ { type: 'fail', id: [ 'test', 3 ] },
            { type: 'fail', id: [ 'test' ] } ] } },
      { args: [ '5-arg1', '5-arg2', '5-arg3' ],
        command: 'command5',
        id: [ 'test', 4 ],
        idName: 'test > 4 | and | command5 5-arg1 5-arg2 5-arg3',
        once: { type: 'success', allOf: [ [ 'test', 3 ] ] },
        emit:
        { onSuccess:
        [ { type: 'success', id: [ 'test', 4 ] },
              { type: 'success', id: [ 'test' ] } ],
          onFail:
          [ { type: 'fail', id: [ 'test', 4 ] },
              { type: 'fail', id: [ 'test' ] } ] } } ]
    expect(cleaned.length).toBe(5)
    expect(cleaned).toEqual(expected)
  })
})
