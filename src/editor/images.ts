export function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Нужен файл изображения'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (!result.startsWith('data:image/')) {
        reject(new Error('Нужен файл изображения'))
        return
      }
      if (result.length > 1_500_000) {
        reject(new Error('Изображение слишком большое для проекта'))
        return
      }
      resolve(result)
    }
    reader.onerror = () => reject(new Error('Не удалось прочитать изображение'))
    reader.readAsDataURL(file)
  })
}
