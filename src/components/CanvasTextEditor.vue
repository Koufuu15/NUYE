<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import type { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TableRow from '@tiptap/extension-table-row'
import { markdownToHtml } from '../lib/markdown'
import { DraggableTableView, EditableTable, selectTableCell, StyledTableCell, StyledTableHeader } from '../lib/tableExtensions'
import { TextStyleMark, UnderlineMark } from '../lib/textStyle'
import type { CanvasItem } from '../types'

const props = defineProps<{
  item: CanvasItem
}>()
const emit = defineEmits<{
  activate: [editor: Editor]
  selectionUpdate: [editor: Editor]
  tablePointerDown: [editor: Editor, wrapper: HTMLElement]
}>()

const editor = useEditor({
  content: props.item.richContent ?? markdownToHtml(props.item.content),
  extensions: [
    StarterKit,
    TextStyleMark,
    UnderlineMark,
    Image.configure({ inline: false, allowBase64: true }),
    EditableTable.configure({ resizable: true, allowTableNodeSelection: true, View: DraggableTableView }),
    TableRow,
    StyledTableHeader,
    StyledTableCell,
  ],
  editorProps: {
    attributes: {
      class: 'canvas-item-editor canvas-rich-text',
      'aria-label': 'キャンバステキスト',
    },
  },
  onFocus: ({ editor: currentEditor }) => emit('activate', currentEditor),
  onSelectionUpdate: ({ editor: currentEditor }) => emit('selectionUpdate', currentEditor),
  onUpdate: ({ editor: currentEditor }) => {
    props.item.richContent = currentEditor.getJSON()
  },
})

onBeforeUnmount(() => editor.value?.destroy())

function handlePointerDown(event: PointerEvent) {
  const currentEditor = editor.value
  if (!currentEditor) return
  emit('activate', currentEditor)
  const target = event.target
  if (!(target instanceof Element)) return
  const wrapper = target.closest<HTMLElement>('.tableWrapper')
  if (wrapper) {
    selectTableCell(currentEditor, event.clientX, event.clientY)
    currentEditor.commands.focus()
    emit('tablePointerDown', currentEditor, wrapper)
  }
}
</script>

<template>
  <div v-if="editor" class="canvas-text-editor-host" @pointerdown="handlePointerDown">
    <EditorContent :editor="editor" :style="{ color: item.textColor || '#3a3430', fontSize: `${item.fontSize ?? 14}px` }" />
  </div>
</template>
