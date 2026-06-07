import sys
import random
import customtkinter as ctk
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg as FigureCanvas
from matplotlib.figure import Figure

# ---------- Design tokens (inspirado pelo exemplo PyQt)
CORES_CT = {
    "bg": "#f5f7fb",
    "card": "#ffffff",
    "muted": "#6b7280",
    "primary": "#2b7cff",
    "accent": "#0f2b44",
}

FONT_TITLE = ("Inter", 20)
FONT_LG_BOLD = ("Inter", 16, "bold")
FONT_BODY = ("Inter", 12)


class CTkCard(ctk.CTkFrame):
    def __init__(self, master, title, value, subtitle=None, **kwargs):
        super().__init__(master, fg_color=CORES_CT['card'], corner_radius=10, **kwargs)
        self.grid_columnconfigure(0, weight=1)
        lbl_title = ctk.CTkLabel(self, text=title, font=("Inter", 13, "bold"), text_color="#222")
        lbl_value = ctk.CTkLabel(self, text=value, font=("Inter", 14, "bold"), text_color=CORES_CT['primary'])
        lbl_title.grid(row=0, column=0, sticky="w", padx=10, pady=(8,2))
        lbl_value.grid(row=1, column=0, sticky="w", padx=10, pady=(0,8))
        if subtitle:
            lbl_sub = ctk.CTkLabel(self, text=subtitle, font=("Inter", 11), text_color=CORES_CT['muted'])
            lbl_sub.grid(row=2, column=0, sticky="w", padx=10, pady=(0,10))


class InventarioPage(ctk.CTkFrame):
    def __init__(self, master):
        super().__init__(master, fg_color=CORES_CT['bg'])
        self.pack(fill="both", expand=True)
        header = ctk.CTkFrame(self, fg_color=CORES_CT['bg'])
        header.pack(fill="x", padx=12, pady=8)
        title = ctk.CTkLabel(header, text="Inventário", font=FONT_TITLE, text_color="#222")
        title.pack(side="left")
        controls = ctk.CTkFrame(header, fg_color=CORES_CT['bg'])
        controls.pack(side="right")
        ctk.CTkButton(controls, text="Adicionar", fg_color=CORES_CT['primary'], text_color="white").pack(side="left", padx=6)
        ctk.CTkButton(controls, text="Exportar", fg_color="transparent", text_color=CORES_CT['primary']).pack(side="left", padx=6)

        cards_area = ctk.CTkFrame(self, fg_color=CORES_CT['bg'])
        cards_area.pack(fill="both", expand=True, padx=12, pady=6)
        grid = ctk.CTkFrame(cards_area, fg_color=CORES_CT['bg'])
        grid.pack()

        for i in range(6):
            card = CTkCard(grid, f"Caixa #{i+1}", f"R${45.90 + i*3:.2f}", subtitle=f"Lucro: R${12.50 + i:.2f}")
            card.grid(row=i//3, column=i%3, padx=8, pady=8, sticky="nsew")


class CaixasPage(ctk.CTkFrame):
    def __init__(self, master):
        super().__init__(master, fg_color=CORES_CT['bg'])
        self.pack(fill="both", expand=True)
        title = ctk.CTkLabel(self, text="Caixas", font=FONT_TITLE, text_color="#222")
        title.pack(anchor="nw", padx=12, pady=12)
        table_frame = ctk.CTkFrame(self, fg_color=CORES_CT['card'])
        table_frame.pack(fill="both", expand=True, padx=12, pady=12)

        # minimal table using grid of labels
        headers = ["Caixa", "Quantidade", "Valor Médio", "Valor Total"]
        for col, h in enumerate(headers):
            lbl = ctk.CTkLabel(table_frame, text=h, font=("Inter", 11, "bold"), text_color="#222")
            lbl.grid(row=0, column=col, padx=8, pady=8)

        caixas = [
            ["Caixa Fraturada", "120", "R$2,80", "R$336,00"],
            ["Caixa CS20", "50", "R$5,20", "R$260,00"],
        ]
        for r, row in enumerate(caixas, start=1):
            for c, v in enumerate(row):
                ctk.CTkLabel(table_frame, text=v, text_color="#222").grid(row=r, column=c, padx=8, pady=6)


class RelatoriosPage(ctk.CTkFrame):
    def __init__(self, master):
        super().__init__(master, fg_color=CORES_CT['bg'])
        self.pack(fill="both", expand=True)
        title = ctk.CTkLabel(self, text="Relatórios", font=FONT_TITLE, text_color="#222")
        title.pack(anchor="nw", padx=12, pady=12)

        fig = Figure(figsize=(5,2.5), dpi=100)
        ax = fig.add_subplot(111)
        items = ["A","B","C","D"]
        values = [random.randint(10,100) for _ in items]
        ax.bar(items, values, color=CORES_CT['primary'])
        canvas = FigureCanvas(fig, master=self)
        canvas.get_tk_widget().pack(fill="both", expand=True, padx=12, pady=12)


class MainWindow(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Painel - Inventário (CTk)")
        self.geometry("900x640")

        # sidebar
        sidebar = ctk.CTkFrame(self, width=180, fg_color=CORES_CT['card'])
        sidebar.pack(side="left", fill="y", padx=8, pady=8)
        ctk.CTkLabel(sidebar, text="Menu", font=("Inter", 14, "bold")).pack(pady=8)
        self.btn_inv = ctk.CTkButton(sidebar, text="Inventário", command=lambda: self.switch('inv'))
        self.btn_boxes = ctk.CTkButton(sidebar, text="Caixas", command=lambda: self.switch('boxes'))
        self.btn_reports = ctk.CTkButton(sidebar, text="Relatórios", command=lambda: self.switch('reports'))
        for b in (self.btn_inv, self.btn_boxes, self.btn_reports):
            b.pack(fill="x", padx=12, pady=6)

        # content
        self.container = ctk.CTkFrame(self, fg_color=CORES_CT['bg'])
        self.container.pack(side="left", fill="both", expand=True)

        self.pages = {
            'inv': InventarioPage(self.container),
            'boxes': CaixasPage(self.container),
            'reports': RelatoriosPage(self.container)
        }
        self.current = None
        self.switch('inv')

    def switch(self, key):
        if self.current:
            self.current.pack_forget()
        self.current = self.pages[key]
        self.current.pack(fill="both", expand=True)


if __name__ == '__main__':
    ctk.set_appearance_mode('light')
    ctk.set_default_color_theme('blue')
    app = MainWindow()
    app.mainloop()
