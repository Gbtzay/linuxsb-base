// Owns the legacy topic timeline, scroll scheduling, and timeline performance sampling.
export function createSkinTimelineController({ window, document, getPage, getPostSelector, isEnabled, hasPerfProbe, emitPerf }) {
  const { performance, Date } = window
  let timelineRaf = 0
  let windowListening = false
  let timelineEmitSec = -1
  let timelineEmitN = 0

  function topicPosts() {
    const sel = getPostSelector() || 'ul.topic-post-list > li.post-entry, ul.post-list > li.post-entry'
    const nodes = [...document.querySelectorAll(sel)]
    return nodes.slice().sort((a, b) => {
      const fa = Number(a.dataset?.floor)
      const fb = Number(b.dataset?.floor)
      const na = Number.isFinite(fa) && fa > 0 ? fa : 0
      const nb = Number.isFinite(fb) && fb > 0 ? fb : 0
      if (na !== nb) return na - nb
      return nodes.indexOf(a) - nodes.indexOf(b)
    })
  }

  function scrollToPost(post, block) {
    post?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: block || 'start',
    })
  }

  function bindTimeline(timeline) {
    if (timeline.dataset.bound) return
    timeline.dataset.bound = '1'
    timeline.querySelector('.lsb-shell-edge[data-timeline-edge="start"]').addEventListener('click', () => {
      scrollToPost(topicPosts()[0], 'start')
    })
    timeline.querySelector('.lsb-shell-edge[data-timeline-edge="end"]').addEventListener('click', () => {
      scrollToPost(topicPosts().at(-1), 'center')
    })
    timeline.querySelector('.lsb-shell-track').addEventListener('click', (event) => {
      const posts = topicPosts()
      if (!posts.length) return
      const rect = event.currentTarget.getBoundingClientRect()
      const ratio = rect.height > 0 ? Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) : 0
      scrollToPost(posts[Math.round(ratio * Math.max(0, posts.length - 1))], 'center')
    })
  }

  function ensureTimeline(shellEl) {
    const onTopic = getPage()?.type === 'topic' && topicPosts().length > 0
    let timeline = shellEl.querySelector('#lsb-shell-timeline')
    if (!onTopic) {
      if (timeline) timeline.hidden = true
      return null
    }
    if (!timeline) {
      timeline = document.createElement('nav')
      timeline.id = 'lsb-shell-timeline'
      timeline.setAttribute('aria-label', '楼层')
      timeline.innerHTML = `
        <button type="button" class="lsb-shell-edge" data-timeline-edge="start">主帖</button>
        <div class="lsb-shell-now"><strong data-timeline-current>主帖</strong><span data-timeline-date></span></div>
        <button type="button" class="lsb-shell-track" data-timeline-track role="scrollbar" aria-label="楼层轨道" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <span class="lsb-shell-thumb" aria-hidden="true"></span>
        </button>
        <div data-timeline-total></div>
        <button type="button" class="lsb-shell-edge" data-timeline-edge="end">最新</button>`
      shellEl.append(timeline)
      bindTimeline(timeline)
    }
    timeline.hidden = false
    return timeline
  }

  function currentTimelinePost(posts) {
    if (!posts.length) return { post: null, index: 0 }
    const offset = 56
    let index = 0
    for (let i = 0; i < posts.length; i += 1) {
      if (posts[i].getBoundingClientRect().top <= offset) index = i
      else break
    }
    return { post: posts[index], index }
  }

  function updateTimeline() {
    timelineRaf = 0
    if (!hasPerfProbe()) {
      updateTimelineBody()
      return
    }
    const t0 = performance.now()
    try {
      updateTimelineBody()
    } finally {
      perfEmitTimeline(performance.now() - t0)
    }
  }

  function updateTimelineBody() {
    const doc = typeof document !== 'undefined' ? document : null
    const timeline = doc?.querySelector?.('#lsb-shell-timeline')
    if (!timeline || !isEnabled()) return
    const posts = topicPosts()
    if (!posts.length) {
      timeline.hidden = true
      return
    }
    timeline.hidden = false
    const { post, index } = currentTimelinePost(posts)
    const floor = Number(post?.dataset?.floor)
    const progress = posts.length > 1 ? (index / (posts.length - 1)) * 100 : 0
    timeline.style.setProperty('--lsb-timeline-progress', `${progress}%`)
    timeline.querySelector('[data-timeline-current]').textContent =
      Number.isFinite(floor) && floor > 1 ? `#${floor}` : '主帖'
    const time = post?.querySelector('time, span[data-performance-time], .post-time')
    timeline.querySelector('[data-timeline-date]').textContent = (time?.textContent || '').trim().slice(0, 24)
    timeline.querySelector('[data-timeline-total]').textContent = `${Math.max(0, posts.length - 1)} 条回复`
    const track = timeline.querySelector('.lsb-shell-track')
    track.setAttribute('aria-valuenow', String(Math.round(progress)))
  }

  function scheduleTimeline() {
    if (timelineRaf) return
    const requestFrame = window.requestAnimationFrame
    timelineRaf = typeof requestFrame === 'function'
      ? requestFrame.call(window, updateTimeline)
      : window.setTimeout(updateTimeline, 16)
  }

  function bindWindow() {
    if (windowListening) return
    windowListening = true
    window.addEventListener('scroll', scheduleTimeline, { passive: true })
    window.addEventListener('resize', scheduleTimeline)
  }

  function unbindWindow() {
    if (!windowListening) return
    windowListening = false
    window.removeEventListener('scroll', scheduleTimeline)
    window.removeEventListener('resize', scheduleTimeline)
  }

  function perfEmitTimeline(ms) {
    if (ms < 8) return
    const sec = Math.floor(Date.now() / 1000)
    if (sec !== timelineEmitSec) {
      timelineEmitSec = sec
      timelineEmitN = 0
    }
    if (timelineEmitN >= 2) return
    timelineEmitN += 1
    emitPerf('timeline.update', ms)
  }

  function cancelPending() {
    if (timelineRaf) {
      const cancel = window.cancelAnimationFrame || window.clearTimeout
      cancel(timelineRaf)
      timelineRaf = 0
    }
  }

  return { ensure: ensureTimeline, schedule: scheduleTimeline, bind: bindWindow, unbind: unbindWindow, cancelPending }
}
