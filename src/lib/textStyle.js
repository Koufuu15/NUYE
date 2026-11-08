import { Mark, mergeAttributes } from '@tiptap/core';
export const TextStyleMark = Mark.create({
    name: 'textStyle',
    addAttributes() {
        return {
            color: {
                default: null,
                parseHTML: (element) => element.style.color || null,
                renderHTML: (attributes) => attributes.color ? { style: `color: ${attributes.color}` } : {},
            },
            fontSize: {
                default: null,
                parseHTML: (element) => Number.parseFloat(element.style.fontSize) || null,
                renderHTML: (attributes) => attributes.fontSize ? { style: `font-size: ${attributes.fontSize}px` } : {},
            },
        };
    },
    parseHTML() {
        return [{ tag: 'span[style]' }];
    },
    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes), 0];
    },
});
export const UnderlineMark = Mark.create({
    name: 'underline',
    parseHTML() {
        return [{ tag: 'u' }, { style: 'text-decoration=underline' }];
    },
    renderHTML({ HTMLAttributes }) {
        return ['u', mergeAttributes(HTMLAttributes), 0];
    },
    addCommands() {
        return {
            toggleUnderline: () => ({ commands }) => commands.toggleMark(this.name),
        };
    },
});
export const HighlightMark = Mark.create({
    name: 'highlight',
    addAttributes() {
        return {
            color: {
                default: '#fff176',
                parseHTML: (element) => element.getAttribute('data-highlight-color') || element.style.backgroundColor || '#fff176',
                renderHTML: (attributes) => {
                    const color = attributes.color;
                    return typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)
                        ? { 'data-highlight-color': color, style: `background-color: ${color}` }
                        : {};
                },
            },
        };
    },
    parseHTML() {
        return [{ tag: 'mark' }];
    },
    renderHTML({ HTMLAttributes }) {
        return ['mark', mergeAttributes(HTMLAttributes), 0];
    },
    addCommands() {
        return {
            toggleHighlight: (attributes) => ({ commands }) => commands.toggleMark(this.name, attributes),
        };
    },
});
