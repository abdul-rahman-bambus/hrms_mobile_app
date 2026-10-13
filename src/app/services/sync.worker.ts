

addEventListener('message', ({ data }) => {
  if (data.action === 'start') {
    const intervalTime = data.interval || 30000; // Default 30s
    
    // Web Workers stay active longer in the background than the UI thread
    setInterval(() => {
      postMessage({ type: 'TICK', timestamp: new Date().toISOString() });
    }, intervalTime);
  }
});