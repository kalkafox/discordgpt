type TextModerationResult = {
  id: string
  model: string
  results: [
    {
      categories: {
        hate: boolean
        'hate/threatening': boolean
        'self-harm': boolean
        sexual: boolean
        'sexual/minors': boolean
        violence: boolean
        'violence/graphic': boolean
      }
      category_scores: {
        hate: number
        'hate/threatening': number
        'self-harm': number
        sexual: number
        'sexual/minors': number
        violence: number
        'violence/graphic': number
      }
      flagged: boolean
    },
  ]
}
