// Which light a widget has selected, per device: survives the widget refreshing or
// remounting, so a change never snaps the widget back to the first light.
export const getSelected = (widget) => {
    try { return localStorage.getItem(`selected_${widget}`); } catch { return null; }
};
export const saveSelected = (widget, id) => {
    try { if (id != null) localStorage.setItem(`selected_${widget}`, String(id)); } catch { /* storage unavailable */ }
};
// From a fresh list: the one picked before (by id), else the remembered one, else the first
export const keepSelected = (list, idOf, currentId, widget) =>
    list.find((x) => String(idOf(x)) === String(currentId))
    || list.find((x) => String(idOf(x)) === String(getSelected(widget)))
    || list[0] || null;
