export async function withDeadline<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Loading timed out. Please try again.')), milliseconds)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
