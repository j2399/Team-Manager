import assert from 'node:assert/strict'
import test from 'node:test'
import {
    buildAttachmentAccessUrl,
    buildAttachmentContentDisposition,
    buildAttachmentStoragePath,
    getAttachmentExtension,
    isAllowedAttachmentType,
} from '@/lib/attachments'

const allowedCases = [
    ['design.png', 'image/png'],
    ['photo.JPG', 'image/jpeg'],
    ['vector.svg', 'image/svg+xml'],
    ['clip.mp4', 'video/mp4'],
    ['movie.webm', 'video/webm'],
    ['voice.ogg', 'audio/ogg'],
    ['song.mp3', 'audio/mpeg'],
    ['spec.pdf', 'application/pdf'],
    ['brief.doc', 'application/msword'],
    ['brief.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['sheet.xls', 'application/vnd.ms-excel'],
    ['sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['slides.ppt', 'application/vnd.ms-powerpoint'],
    ['slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['notes.txt', 'text/plain'],
    ['notes.md', 'text/markdown'],
    ['data.json', 'application/json'],
    ['feed.xml', 'application/xml'],
    ['table.csv', 'text/csv'],
    ['archive.zip', 'application/zip'],
    ['archive.rar', 'application/octet-stream'],
    ['archive.7z', 'application/octet-stream'],
    ['archive.tar', 'application/octet-stream'],
    ['archive.gz', 'application/gzip'],
    ['sketch.bmp', 'image/bmp'],
]

for (const [fileName, fileType] of allowedCases) {
    test(`allows ${fileName} with ${fileType}`, () => {
        assert.equal(isAllowedAttachmentType(fileName, fileType), true)
    })
}

const rejectedCases = [
    ['script.exe', 'application/octet-stream'],
    ['payload.bin', 'application/octet-stream'],
    ['library.dll', 'application/octet-stream'],
    ['installer.pkg', 'application/octet-stream'],
    ['shell.sh', 'application/x-sh'],
    ['program.app', 'application/octet-stream'],
    ['batch.bat', 'text/plain'],
    ['command.cmd', 'text/plain'],
    ['malware.scr', 'application/octet-stream'],
    ['extension.crx', 'application/octet-stream'],
    ['unknown', 'application/octet-stream'],
    ['readme', 'text/plain'],
]

for (const [fileName, fileType] of rejectedCases) {
    test(`rejects ${fileName} with ${fileType}`, () => {
        assert.equal(isAllowedAttachmentType(fileName, fileType), false)
    })
}

const extensionCases = [
    ['photo.png', 'png'],
    ['archive.tar.gz', 'gz'],
    ['README', 'readme'],
    ['weird.name.JSON', 'json'],
    ['.gitignore', 'gitignore'],
    ['presentation.PPTX', 'pptx'],
]

for (const [fileName, expected] of extensionCases) {
    test(`extracts extension for ${fileName}`, () => {
        assert.equal(getAttachmentExtension(fileName), expected)
    })
}

const accessUrlCases: Array<[string, boolean, string]> = [
    ['attachment-1', false, '/api/attachments/attachment-1'],
    ['attachment-1', true, '/api/attachments/attachment-1?download=1'],
    ['abc123', false, '/api/attachments/abc123'],
    ['xyz789', true, '/api/attachments/xyz789?download=1'],
]

for (const [attachmentId, download, expected] of accessUrlCases) {
    test(`builds access url for ${attachmentId} (download=${download})`, () => {
        assert.equal(buildAttachmentAccessUrl(attachmentId, download), expected)
    })
}

const contentDispositionCases: Array<[string, boolean, string]> = [
    ['report.pdf', true, 'attachment; filename="report.pdf"; filename*=UTF-8\'\'report.pdf'],
    ['design brief.pdf', true, 'attachment; filename="design brief.pdf"; filename*=UTF-8\'\'design%20brief.pdf'],
    ['notes.txt', false, 'inline; filename="notes.txt"; filename*=UTF-8\'\'notes.txt'],
    ['quote"test.csv', true, 'attachment; filename="quote_test.csv"; filename*=UTF-8\'\'quote%22test.csv'],
    ['line\nbreak.md', false, 'inline; filename="line_break.md"; filename*=UTF-8\'\'line%0Abreak.md'],
]

for (const [fileName, download, expected] of contentDispositionCases) {
    test(`builds content disposition for ${fileName}`, () => {
        assert.equal(buildAttachmentContentDisposition(fileName, download), expected)
    })
}

for (let index = 0; index < 20; index += 1) {
    test(`builds randomized storage path #${index + 1}`, () => {
        const fileName = index % 2 === 0 ? `spec-${index}.pdf` : `image-${index}.png`
        const path = buildAttachmentStoragePath('task-123', fileName)

        assert.match(path, /^task-123\/[0-9a-f-]+\.(pdf|png)$/)
        assert.equal(path.startsWith('task-123/'), true)
    })
}
