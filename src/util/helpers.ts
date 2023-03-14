export const format_time = (time: number) => {
  const seconds = Math.floor(time / 1000)
  const minutes = Math.floor(seconds / 60)

  const seconds_rem = seconds % 60

  const seconds_string = seconds_rem.toString()

  if (minutes > 0) return `${minutes} minutes and ${seconds_string} seconds`
  return `${seconds_string} seconds`
}
