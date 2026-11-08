import Table, { TableView } from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { CellSelection } from '@tiptap/pm/tables';
function cellStyleAttributes() {
    return {
        backgroundColor: {
            default: null,
            parseHTML: (element) => element.style.backgroundColor || null,
            renderHTML: (attributes) => {
                const color = attributes.backgroundColor;
                return typeof color === 'string' && /^#[\da-f]{3,8}$/i.test(color)
                    ? { style: `background-color: ${color}` }
                    : {};
            },
        },
        borderWidth: {
            default: null,
            parseHTML: (element) => {
                const width = Number.parseFloat(element.style.borderWidth);
                return Number.isFinite(width) ? width : null;
            },
            renderHTML: (attributes) => {
                const value = attributes.borderWidth;
                const width = typeof value === 'number' || typeof value === 'string' && value.trim()
                    ? Number(value)
                    : Number.NaN;
                return Number.isFinite(width) && width >= 0 && width <= 20
                    ? { style: `border-width: ${width}px` }
                    : {};
            },
        },
    };
}
export const EditableTable = Table.extend({ draggable: true });
export class DraggableTableView extends TableView {
    constructor(node, cellMinWidth) {
        super(node, cellMinWidth);
        this.table.draggable = true;
    }
    update(node) {
        const updated = super.update(node);
        this.table.draggable = true;
        return updated;
    }
}
export const StyledTableCell = TableCell.extend({
    addAttributes() {
        return { ...this.parent?.(), ...cellStyleAttributes() };
    },
});
export const StyledTableHeader = TableHeader.extend({
    addAttributes() {
        return { ...this.parent?.(), ...cellStyleAttributes() };
    },
});
export function selectTableCell(editor, clientX, clientY) {
    const position = editor.view.posAtCoords({ left: clientX, top: clientY })?.pos;
    if (position === undefined)
        return;
    const $position = editor.state.doc.resolve(position);
    for (let depth = $position.depth; depth > 0; depth--) {
        const type = $position.node(depth).type.name;
        if (type === 'tableCell' || type === 'tableHeader') {
            const selection = CellSelection.create(editor.state.doc, $position.before(depth));
            editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView());
            return;
        }
    }
}
