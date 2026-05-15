import { beforeEach, describe, expect, it } from 'vitest'
import { useHistoryStore } from '../historyStore'

const createSnapshot = (title: string) => ({
  spaceInfo: {
    width: 1000,
    height: 2400,
    depth: 600
  } as any,
  placedModules: [],
  basicInfo: {
    title,
    location: ''
  }
})

describe('HistoryStore', () => {
  beforeEach(() => {
    useHistoryStore.setState({
      history: [],
      currentIndex: -1,
      activeScopeId: null
    })
  })

  it('같은 scope 안에서만 undo된다', () => {
    const store = useHistoryStore.getState()

    store.setScope('design-a', createSnapshot('A 초기'))
    store.saveState(createSnapshot('A 수정'), 'design-a')

    const previousState = useHistoryStore.getState().undo('design-a')

    expect(previousState?.basicInfo.title).toBe('A 초기')
  })

  it('scope가 바뀌면 이전 디자인 히스토리로 넘어가지 않는다', () => {
    let store = useHistoryStore.getState()

    store.setScope('design-a', createSnapshot('A 초기'))
    store.saveState(createSnapshot('A 수정'), 'design-a')

    store = useHistoryStore.getState()
    store.setScope('design-b', createSnapshot('B 초기'))
    store.saveState(createSnapshot('B 수정'), 'design-b')

    const previousState = useHistoryStore.getState().undo('design-b')
    const crossedState = useHistoryStore.getState().undo('design-b')

    expect(previousState?.basicInfo.title).toBe('B 초기')
    expect(crossedState).toBeNull()
  })

  it('현재 scope와 다른 undo 요청은 무시된다', () => {
    const store = useHistoryStore.getState()

    store.setScope('design-b', createSnapshot('B 초기'))
    store.saveState(createSnapshot('B 수정'), 'design-b')

    const previousState = useHistoryStore.getState().undo('design-a')

    expect(previousState).toBeNull()
    expect(useHistoryStore.getState().currentIndex).toBe(1)
  })
})
