// Thin client for the Python backend.

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(path, options)
  } catch {
    const error = new Error('Cannot reach Annotator. Is python app.py still running?')
    error.status = 0
    throw error
  }
  if (!response.ok) {
    let message = `Something went wrong (${response.status}).`
    try {
      const body = await response.json()
      if (typeof body.detail === 'string') message = body.detail
    } catch {
      // keep the generic message
    }
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  return response.json()
}

function json(method, body, extra = {}) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...extra,
  }
}

const boxOf = ({ x, y, w, h }) => ({ x, y, w, h })

export const api = {
  state: () => request('/api/state'),
  reset: (keepLabels) => request('/api/reset', json('POST', { keep_labels: keepLabels })),

  upload: (file) => {
    const form = new FormData()
    form.append('files', file, file.name)
    return request('/api/upload', { method: 'POST', body: form })
  },
  deleteImage: (id) => request(`/api/images/${id}`, { method: 'DELETE' }),
  saveAnnotations: (id, annotations, keepalive = false) =>
    request(`/api/images/${id}/annotations`, json('PUT', { annotations }, { keepalive })),

  createLabel: (name) => request('/api/labels', json('POST', { name })),
  updateLabel: (id, patch) => request(`/api/labels/${id}`, json('PATCH', patch)),
  deleteLabel: (id) => request(`/api/labels/${id}`, { method: 'DELETE' }),

  snap: (imageId, box) => request('/api/smart/snap', json('POST', { image_id: imageId, box: boxOf(box) })),
  click: (imageId, x, y) => request('/api/smart/click', json('POST', { image_id: imageId, x, y })),
  similar: (imageId, box, exclude) =>
    request(
      '/api/smart/similar',
      json('POST', { image_id: imageId, box: boxOf(box), exclude: exclude.map(boxOf) }),
    ),
  propose: (imageId, exclude) =>
    request('/api/smart/propose', json('POST', { image_id: imageId, exclude: exclude.map(boxOf) })),

  imageUrl: (id) => `/api/images/${id}/file`,
  thumbUrl: (id) => `/api/images/${id}/thumb`,
  exportJsonUrl: '/api/export/coco',
  exportZipUrl: '/api/export/coco.zip',
}
