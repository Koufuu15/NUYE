<script setup>
import { onBeforeUnmount } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { markdownToHtml } from '../lib/markdown';
import {
  DraggableTableView,
  EditableTable,
  selectTableCell,
  StyledTableCell,
  StyledTableHeader,
  StyledTableRow,
} from '../lib/tableExtensions'
import { HighlightMark, TextStyleMark, UnderlineMark } from '../lib/textStyle';
const props = defineProps({
    item: { type: Object, required: true },
});
const emit = defineEmits(['activate', 'selectionUpdate', 'tablePointerDown']);
const editor = useEditor({
    content: props.item.richContent ?? markdownToHtml(props.item.content),
    extensions: [
        StarterKit,
        HighlightMark,
        TextStyleMark,
        UnderlineMark,
        Image.configure({ inline: false, allowBase64: true }),
        EditableTable.configure({ resizable: true, allowTableNodeSelection: true, View: DraggableTableView }),
        StyledTableRow,
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
        props.item.richContent = currentEditor.getJSON();
    },
});
onBeforeUnmount(() => editor.value?.destroy());
function handlePointerDown(event) {
    const currentEditor = editor.value;
    if (!currentEditor)
        return;
    emit('activate', currentEditor);
    const target = event.target;
    if (!(target instanceof Element))
        return;
    const wrapper = target.closest('.tableWrapper');
    if (wrapper) {
        selectTableCell(currentEditor, event.clientX, event.clientY);
        currentEditor.commands.focus();
        emit('tablePointerDown', currentEditor, wrapper);
    }
}
</script>

<template>
  <div v-if="editor" class="canvas-text-editor-host" @pointerdown="handlePointerDown">
    <EditorContent :editor="editor" :style="{ color: item.textColor || '#3a3430', fontSize: `${item.fontSize ?? 14}px` }" />
  </div>
</template>
