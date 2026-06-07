import customtkinter as ctk
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk
import pandas as pd
import threading
import time
import random
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg as FigureCanvas
from matplotlib.figure import Figure
from pathlib import Path
import os
from datetime import datetime
# queue removed; logs will be handled by LogManager (backend-only)
from PIL import Image, ImageTk, ImageOps

from system_core import LogManager, DatabaseManager, SteamManager, SchedulerManager, SteamRateLimitError

# Temas de cores
CORES = {
    "primary": "#0f2b44",
    "secondary": "#13464a",
    "accent": "#8b5cf6",
    "background": "#071226",
    "card_bg": "#0d1b2a",
    "text_primary": "#e6eef8",
    "text_secondary": "#98a9c7",
    "border": "#0f2a3a",
    "success": "#22c55e",
    "warning": "#ff6b6b",
    "accent_alt": "#2f7cff"
}

# Cores específicas para estatísticas e interações
STAT_COLORS = {
    "quantity": "#2f7cff",
    "purchase": "#2dd4bf",
    "current": "#7c5cff",
    "fee": "#8b5cf6",
    "net": "#22c55e",
}

# cor ao passar o mouse sobre card
CARD_HOVER = "#122737"

# Fontes e tamanhos base
FONT_TITLE = ("Inter", 28, "bold")
FONT_LG_BOLD = ("Inter", 18, "bold")
FONT_MED_BOLD = ("Inter", 16, "bold")
FONT_SMALL_BOLD = ("Inter", 12, "bold")
FONT_BUTTON = ("Inter", 12, "bold")
FONT_BODY = ("Inter", 13)
LOG_FONT = ("Courier", 10)
FONT_SMALL = ("Inter", 12)
FONT_ICON = ("Inter", 20)
FONT_CARD_TITLE = ("Inter", 13, "bold")

class InventarioSistema:
    def __init__(self, root):
        self.root = root
        self.root.title("📊 Gerenciador de Inventário PRO")
        self.root.geometry("1600x900")
        self.root.resizable(True, True)
        
        # Configurar tema
        ctk.set_appearance_mode("light")
        ctk.set_default_color_theme("blue")
        
        # Inicializar componentes
        self.log_manager = LogManager()
        self.db_manager = DatabaseManager(log_manager=self.log_manager)
        self.steam_manager = SteamManager(log_manager=self.log_manager)
        self.scheduler_manager = SchedulerManager(
            self.db_manager, self.steam_manager, self.log_manager
        )
        
        # Dados
        self.df = None
        self.arquivo_aberto = None
        # UI logs removed; backend LogManager keeps records
        self.current_page = 0
        self.items_per_page = 6
        self.card_widgets = {}
        self.cards_cache_valid = False
        self.empty_state_label = None
        
        # Iniciar scheduler
        self.scheduler_manager.schedule_daily_update(hour=10, minute=0)
        self.scheduler_manager.start_scheduler_thread()
        
        self.log_manager.log_action("Application started")
        
        self.create_interface()
        
        # Carregar arquivo automaticamente ao iniciar
        self.root.after(500, self._carregar_arquivo_automatico)
    
    def create_interface(self):
        # Container principal com 3 colunas (sidebar, centro, logs)
        main_container = ctk.CTkFrame(self.root, fg_color=CORES["background"])
        main_container.pack(fill=tk.BOTH, expand=True)

        # SIDEBAR (esquerda)
        sidebar_frame = ctk.CTkFrame(main_container, fg_color=CORES["card_bg"], corner_radius=12, width=260)
        sidebar_frame.pack(side=tk.LEFT, fill=tk.Y, padx=8, pady=8)
        sidebar_frame.pack_propagate(False)
        self.create_sidebar(sidebar_frame)

        # CENTRO (inventário)
        center_frame = ctk.CTkFrame(main_container, fg_color=CORES["background"])
        center_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=6, pady=8)
        # store center frame for view switching
        self.center_frame = center_frame

        # Create a pages container and instantiate pages (inventory uses existing implementation)
        self.pages_container = ctk.CTkFrame(self.center_frame, fg_color=CORES["background"])
        self.pages_container.pack(fill=tk.BOTH, expand=True)

        # Inventory page (build once)
        inv_frame = ctk.CTkFrame(self.pages_container, fg_color=CORES["background"])
        inv_frame.pack(fill=tk.BOTH, expand=True)
        self.create_inventory_panel(inv_frame)

        # Other pages (created but not packed yet)
        caixas_frame = ctk.CTkFrame(self.pages_container, fg_color=CORES["background"])
        reports_frame = ctk.CTkFrame(self.pages_container, fg_color=CORES["background"]) 
        purchases_frame = ctk.CTkFrame(self.pages_container, fg_color=CORES["background"])
        settings_frame = ctk.CTkFrame(self.pages_container, fg_color=CORES["background"])

        # fill caixas page
        self._build_caixas_page(caixas_frame)
        # fill reports page
        self._build_reports_page(reports_frame)
        # build purchases/settings pages
        self._build_purchases_page(purchases_frame)
        ctk.CTkLabel(settings_frame, text="⚙️ Configurações", font=FONT_TITLE, text_color=CORES["text_primary"]).pack(pady=20)

        # Store pages
        self.pages = {
            "inventario": inv_frame,
            "caixas": caixas_frame,
            "compras": purchases_frame,
            "relatorios": reports_frame,
            "config": settings_frame,
        }

        # Set current and ensure inventory visible
        self.current_page_key = "inventario"
        # Right logs panel removed from UI (logs are backend-only)
    
    def create_inventory_panel(self, parent):
        # Topo
        top_frame = ctk.CTkFrame(parent, fg_color=CORES["card_bg"], height=108, corner_radius=12)
        top_frame.pack(fill=tk.X, padx=0, pady=0)
        top_frame.pack_propagate(False)
        
        title_label = ctk.CTkLabel(
            top_frame, text="📦 MEU INVENTÁRIO", 
            font=FONT_TITLE, 
            text_color=CORES["text_primary"]
        )
        title_label.pack(side=tk.LEFT, padx=(18, 12), pady=28)

        summary_frame = ctk.CTkFrame(top_frame, fg_color=CORES["card_bg"])
        summary_frame.pack(side=tk.LEFT, fill=tk.X, expand=True, pady=12)
        self.summary_labels = {}
        for key, label in [
            ("quantity", "Qtd."),
            ("purchase", "Compra"),
            ("current", "Bruto"),
            ("fee", "Taxa"),
            ("net", "Liq."),
        ]:
            color = STAT_COLORS.get(key, CORES["accent_alt"])
            stat_frame = ctk.CTkFrame(summary_frame, fg_color=color, corner_radius=10)
            stat_frame.pack(side=tk.LEFT, padx=8, pady=6)
            stat_frame.configure(width=132, height=72)
            stat_frame.pack_propagate(False)
            ctk.CTkLabel(
                stat_frame, text=label, font=FONT_SMALL_BOLD,
                text_color=CORES["card_bg"]
            ).pack(anchor="w", padx=12, pady=(8, 0))
            value_label = ctk.CTkLabel(
                stat_frame, text="0", font=FONT_MED_BOLD,
                text_color=CORES["card_bg"]
            )
            value_label.pack(anchor="w", padx=12, pady=(6, 0))
            self.summary_labels[key] = value_label
        
        # Botões no topo
        buttons_frame = ctk.CTkFrame(top_frame, fg_color=CORES["card_bg"])
        buttons_frame.pack(side=tk.RIGHT, padx=14, pady=32)
        
        ctk.CTkButton(
            buttons_frame, text="📂 Abrir", command=self.abrir_arquivo,
            fg_color=STAT_COLORS.get('quantity', CORES["accent_alt"]), text_color="white", width=86, height=36,
            font=FONT_BUTTON
        ).pack(side=tk.LEFT, padx=3)
        
        ctk.CTkButton(
            buttons_frame, text="➕ Novo", command=self.adicionar_item,
            fg_color=STAT_COLORS.get('purchase', CORES["secondary"]), text_color="white", width=86, height=36,
            font=FONT_BUTTON
        ).pack(side=tk.LEFT, padx=3)
        
        ctk.CTkButton(
            buttons_frame, text="💾 Salvar", command=self.salvar_arquivo,
            fg_color=STAT_COLORS.get('net', CORES["success"]), text_color="white", width=86, height=36,
            font=FONT_BUTTON
        ).pack(side=tk.LEFT, padx=3)

        self.update_all_button = ctk.CTkButton(
            buttons_frame, text="🔄 Atualizar", command=self.atualizar_precos_todos,
            fg_color=CORES["accent_alt"], text_color="white", width=100, height=36,
            font=FONT_BUTTON
        )
        self.update_all_button.pack(side=tk.LEFT, padx=3)
        
        ctk.CTkButton(
            buttons_frame, text="⚙️ Config", command=self.abrir_configuracoes,
            fg_color=CORES["warning"], text_color="white", width=86, height=36,
            font=FONT_BUTTON
        ).pack(side=tk.LEFT, padx=3)
        
        # Barra de busca
        search_frame = ctk.CTkFrame(parent, fg_color=CORES["card_bg"], corner_radius=10)
        search_frame.pack(fill=tk.X, padx=10, pady=10)
        
        ctk.CTkLabel(
            search_frame, text="🔍 Buscar:", 
            font=FONT_SMALL_BOLD,
            text_color=CORES["text_primary"]
        ).pack(side=tk.LEFT, padx=10)
        
        self.search_var = tk.StringVar()
        self.search_var.trace_add("write", self._resetar_pagina_busca)
        search_entry = ctk.CTkEntry(
            search_frame, 
            textvariable=self.search_var,
            placeholder_text="Buscar caixas...",
            width=380, height=36,
            fg_color="#091827", placeholder_text_color=CORES["text_secondary"],
            font=FONT_BODY
        )
        search_entry.pack(side=tk.LEFT, padx=5)
        
        # Área principal paginada. Evita artefatos de repaint do CustomTkinter em scroll longo.
        main_content = ctk.CTkFrame(parent, fg_color=CORES["background"])
        main_content.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        
        self.cards_frame = ctk.CTkFrame(main_content, fg_color=CORES["background"])
        self.cards_frame.pack(fill=tk.BOTH, expand=True)
        self.root.bind_all("<MouseWheel>", self._on_mousewheel_page, add="+")
        self.root.bind_all("<Button-4>", self._on_mousewheel_page, add="+")
        self.root.bind_all("<Button-5>", self._on_mousewheel_page, add="+")

        self.pagination_frame = ctk.CTkFrame(parent, fg_color=CORES["background"], height=42)
        self.pagination_frame.pack(fill=tk.X, padx=10, pady=(0, 6))
        self.pagination_frame.pack_propagate(False)

        self.prev_page_button = ctk.CTkButton(
            self.pagination_frame, text="Anterior", command=self.pagina_anterior,
            fg_color=CORES["text_secondary"], text_color="white", width=110, height=30,
            font=FONT_SMALL_BOLD
        )
        self.prev_page_button.pack(side=tk.LEFT, padx=(0, 8), pady=6)

        self.page_label = ctk.CTkLabel(
            self.pagination_frame, text="Página 0/0",
            font=FONT_SMALL_BOLD, text_color=CORES["text_primary"]
        )
        self.page_label.pack(side=tk.LEFT, expand=True, pady=8)

        self.next_page_button = ctk.CTkButton(
            self.pagination_frame, text="Próxima", command=self.proxima_pagina,
            fg_color=CORES["primary"], text_color="white", width=110, height=30,
            font=FONT_SMALL_BOLD
        )
        self.next_page_button.pack(side=tk.RIGHT, padx=(8, 0), pady=6)
        
        # Status bar
        self.status_frame = ctk.CTkFrame(parent, fg_color=CORES["card_bg"], height=40)
        self.status_frame.pack(fill=tk.X, padx=0, pady=0)
        self.status_frame.pack_propagate(False)
        
        self.status_label = ctk.CTkLabel(
            self.status_frame, 
            text="👋 Carregue um arquivo para começar",
            font=FONT_SMALL,
            text_color=CORES["text_secondary"]
        )
        self.status_label.pack(side=tk.LEFT, padx=15, pady=10)
    
    # Logs moved to backend-only. UI panel removed.

    def create_sidebar(self, parent):
        """Cria a barra lateral de navegação semelhante ao mock."""
        top = ctk.CTkFrame(parent, fg_color=CORES["card_bg"], corner_radius=8)
        top.pack(fill=tk.X, padx=12, pady=(12, 6))

        # Logo
        logo_frame = ctk.CTkFrame(top, fg_color=CORES["card_bg"], corner_radius=6)
        logo_frame.pack(fill=tk.X)
        logo_icon = ctk.CTkLabel(logo_frame, text="📦", font=FONT_ICON, text_color=CORES["accent_alt"]) 
        logo_icon.grid(row=0, column=0, rowspan=2, padx=(6, 8), pady=8)
        ctk.CTkLabel(logo_frame, text="MEU INVENTÁRIO", font=FONT_SMALL_BOLD, text_color=CORES["text_primary"]).grid(row=0, column=1, sticky="w", pady=(8,0))
        ctk.CTkLabel(logo_frame, text="Gerenciador PRO", font=FONT_SMALL, text_color=CORES["text_secondary"]).grid(row=1, column=1, sticky="w", pady=(0,8))

        # Menu
        menu_frame = ctk.CTkFrame(parent, fg_color=CORES["card_bg"])
        # não expandir para evitar espaçamentos grandes; itens ficam mais compactos
        menu_frame.pack(fill=tk.X, expand=False, padx=8, pady=(6, 6))
        self.menu_frame = menu_frame

        menu_items = [
            ("📦", "Inventário"),
            ("🪙", "Caixas"),
            ("💰", "Compras"),
            ("📊", "Relatórios"),
            ("🧾", "Logs do Sistema"),
            ("⚙️", "Configurações"),
        ]

        # mapping menu text -> view function
        view_map = {
            "Inventário": lambda: self.switch_page("inventario"),
            "Caixas": lambda: self.switch_page("caixas"),
            "Compras": lambda: self.switch_page("compras"),
            "Relatórios": lambda: self.switch_page("relatorios"),
            "Logs do Sistema": lambda: self.switch_page("relatorios"),  # logs UI removed; show reports/info instead
            "Configurações": lambda: self.switch_page("config"),
        }

        for idx, (icon, text) in enumerate(menu_items):
            row = ctk.CTkFrame(menu_frame, fg_color=CORES["card_bg"])
            # reduzir espaçamento vertical entre abas
            row.pack(fill=tk.X, pady=2)

            indicator = ctk.CTkFrame(row, width=6, fg_color=CORES["card_bg"])
            indicator.pack(side=tk.LEFT, fill=tk.Y, padx=(4,6))

            # resolve function for this menu
            func = view_map.get(text, lambda: self.log_na_ui(f"Menu: {text}", "INFO"))
            btn = ctk.CTkButton(row, text=f" {icon}  {text}", anchor="w",
                                 fg_color="transparent", hover_color="#0f3650",
                                 text_color=CORES["text_secondary"], corner_radius=8,
                                 height=36,
                                 command=lambda f=func, ix=idx: (self._set_active_menu(ix), f()))
            btn.pack(side=tk.LEFT, fill=tk.X)

            # marcar primeiro como ativo
            if idx == 0:
                indicator.configure(fg_color=CORES["accent_alt"]) 
                btn.configure(text_color=CORES["text_primary"], fg_color="#0f3650")

        # Resumo geral
        resumo = ctk.CTkFrame(parent, fg_color="#071b2a", corner_radius=8)
        resumo.pack(fill=tk.X, padx=12, pady=(6, 8))
        ctk.CTkLabel(resumo, text="RESUMO GERAL", font=FONT_SMALL_BOLD, text_color=CORES["text_secondary"]).pack(anchor="w", padx=12, pady=(10,6))
        for label, value in [("Total de Caixas", "558 un."),("Valor Bruto", "R$1.614,03"),("Valor Líquido", "R$1.371,93"),("Taxas (Steam)", "R$242,10")]:
            row = ctk.CTkFrame(resumo, fg_color="#071b2a")
            row.pack(fill=tk.X, padx=12, pady=2)
            ctk.CTkLabel(row, text=label, text_color=CORES["text_secondary"]).pack(side=tk.LEFT)
            ctk.CTkLabel(row, text=value, text_color=CORES["text_primary"]).pack(side=tk.RIGHT)

        # Perfil
        perfil = ctk.CTkFrame(parent, fg_color=CORES["card_bg"], corner_radius=10)
        perfil.pack(fill=tk.X, padx=12, pady=(4,8))
        avatar = ctk.CTkLabel(perfil, text="👤", font=FONT_ICON, text_color=CORES["accent_alt"]) 
        avatar.pack(side=tk.LEFT, padx=12, pady=12)
        info = ctk.CTkFrame(perfil, fg_color=CORES["card_bg"]) 
        info.pack(side=tk.LEFT, padx=6)
        ctk.CTkLabel(info, text="Administrador", font=FONT_SMALL, text_color=CORES["text_primary"]).pack(anchor="w")
        ctk.CTkLabel(info, text="Sistema PRO", font=FONT_SMALL, text_color=CORES["text_secondary"]).pack(anchor="w")
        # Theme toggle
        try:
            switch = ctk.CTkSwitch(perfil, text="Modo escuro", command=self._toggle_theme)
            switch.pack(side=tk.RIGHT, padx=10)
            # initialize switch state
            if ctk.get_appearance_mode() == "dark":
                switch.select()
        except Exception:
            pass
    
    def log_na_ui(self, message, level="INFO"):
        """Roteia logs para o LogManager (backend-only).
        Mensagens são sanitizadas para ASCII para evitar erros de encoding no console.
        """
        try:
            ascii_message = message.encode('ascii', 'ignore').decode()
        except Exception:
            ascii_message = message

        if level == "ERROR":
            self.log_manager.log_error(ascii_message)
        elif level == "CLICK":
            self.log_manager.log_click(ascii_message)
        else:
            self.log_manager.log_action(ascii_message)

    def clear_center(self):
        """Remove widgets atuais do centro para trocar de view."""
        try:
            for w in list(self.center_frame.winfo_children()):
                w.destroy()
        except Exception:
            pass

    def _set_active_menu(self, idx):
        """Marca visualmente o item de menu ativo pelo índice."""
        try:
            for i, row in enumerate(self.menu_frame.winfo_children()):
                children = row.winfo_children()
                if len(children) >= 2:
                    indicator, button = children[0], children[1]
                    indicator.configure(fg_color=CORES["card_bg"])
                    button.configure(text_color=CORES["text_secondary"], fg_color="transparent")
            # set clicked
            row = self.menu_frame.winfo_children()[idx]
            children = row.winfo_children()
            if len(children) >= 2:
                indicator, button = children[0], children[1]
                indicator.configure(fg_color=CORES["accent_alt"]) 
                button.configure(text_color=CORES["text_primary"], fg_color="#0f3650")
        except Exception:
            pass

    def show_inventory(self):
        # kept for backward compatibility; switch to inventory page
        self.switch_page("inventario")

    def show_boxes(self):
        self.switch_page("caixas")

    def show_purchases(self):
        self.switch_page("compras")

    def show_reports(self):
        self.switch_page("relatorios")

    def switch_page(self, key):
        """Mostra a página identificada por `key` dentro de `self.pages`.
        Esconde a anterior e empacota a nova."""
        try:
            if key == self.current_page_key:
                return
            # hide current
            current = self.pages.get(self.current_page_key)
            if current and current.winfo_ismapped():
                current.pack_forget()
            # show new
            new = self.pages.get(key)
            if new:
                new.pack(fill=tk.BOTH, expand=True)
                self.current_page_key = key
        except Exception:
            pass

    def _toggle_theme(self):
        """Alterna tema claro/escuro global do CustomTkinter."""
        try:
            current = ctk.get_appearance_mode()
            new = "dark" if current == "light" else "light"
            ctk.set_appearance_mode(new)
            self.log_manager.log_action("Theme toggled", {"mode": new})
        except Exception:
            pass

    def _build_purchases_page(self, parent):
        parent.pack_propagate(False)
        header = ctk.CTkFrame(parent, fg_color=CORES["background"])
        header.pack(fill=tk.X, padx=12, pady=8)
        ctk.CTkLabel(header, text="💳 Compras", font=FONT_TITLE, text_color=CORES["text_primary"]).pack(side=tk.LEFT)
        controls = ctk.CTkFrame(header, fg_color=CORES["background"])
        controls.pack(side=tk.RIGHT)
        search_var = tk.StringVar()
        search_entry = ctk.CTkEntry(controls, placeholder_text="Filtrar por item...", width=220, textvariable=search_var)
        search_entry.pack(side=tk.LEFT, padx=6)
        export_btn = ctk.CTkButton(controls, text="Exportar CSV", command=lambda: self._export_purchases_csv())
        export_btn.pack(side=tk.LEFT, padx=6)

        table_frame = ctk.CTkFrame(parent, fg_color=CORES["card_bg"], corner_radius=8)
        table_frame.pack(fill=tk.BOTH, expand=True, padx=12, pady=12)

        cols = ("Item", "Quantidade", "Valor Compra", "Valor Atual", "_source_row")
        tree = ttk.Treeview(table_frame, columns=cols, show="headings")
        for c in cols:
            tree.heading(c, text=c)
            tree.column(c, anchor="w")
        tree.pack(fill=tk.BOTH, expand=True)
        # populate from df if available
        if self.df is not None:
            for _, row in self.df.iterrows():
                tree.insert("", tk.END, values=(
                    row.get("Item", ""), int(self._to_float(row.get("Qtd.", 0))),
                    self._format_currency(self._to_float(row.get("Valor de Compra", 0))),
                    self._format_currency(self._to_float(row.get("Valor Atual", 0))),
                    int(row.get("_source_row", 0))
                ))
        # filter binding
        def _filter_tree(*_):
            q = search_var.get().strip().lower()
            for item in tree.get_children():
                vals = tree.item(item, "values")
                name = str(vals[0]).lower()
                tree.item(item, tags=())
                if q and q not in name:
                    tree.detach(item)
                else:
                    tree.reattach(item, '', 'end')
        search_var.trace_add("write", _filter_tree)

    def _export_purchases_csv(self):
        if self.df is None:
            messagebox.showwarning("Aviso", "Nenhum dado para exportar")
            return
        path = filedialog.asksaveasfilename(defaultextension=".csv", filetypes=[("CSV", "*.csv")])
        if not path:
            return
        try:
            self.df.to_csv(path, index=False)
            messagebox.showinfo("Sucesso", f"Exportado para {path}")
        except Exception as e:
            messagebox.showerror("Erro", str(e))

    def _build_caixas_page(self, parent):
        parent.pack_propagate(False)
        ctk.CTkLabel(parent, text="📦 Caixas", font=FONT_TITLE, text_color=CORES["text_primary"]).pack(anchor="nw", pady=12, padx=12)
        table = ctk.CTkFrame(parent, fg_color=CORES["card_bg"], corner_radius=8)
        table.pack(fill=tk.BOTH, expand=True, padx=12, pady=12)
        headers = ["Caixa", "Quantidade", "Valor Médio", "Valor Total"]
        for col, h in enumerate(headers):
            lbl = ctk.CTkLabel(table, text=h, font=FONT_SMALL_BOLD, text_color=CORES["text_primary"]) 
            lbl.grid(row=0, column=col, padx=8, pady=8)
        # if df available, aggregate by Item
        rows = []
        if self.df is not None and len(self.df) > 0:
            df = self.df.copy()
            df['Total Bruto'] = df['Qtd.'].apply(self._to_float) * df['Valor Atual'].apply(self._to_float)
            agg = df.groupby('Item').agg(
                quantidade=('Qtd.', 'sum'),
                valor_medio=('Valor Atual', lambda x: (x.dropna().apply(self._to_float).mean() if len(x)>0 else 0)),
                valor_total=('Total Bruto', 'sum')
            ).reset_index()
            for r, row in agg.iterrows():
                rows.append([row['Item'], int(row['quantidade']), self._format_currency(row['valor_medio']), self._format_currency(row['valor_total'])])
        else:
            rows = [["Caixa Fraturada", "120", "R$2,80", "R$336,00"],["Caixa CS20", "50", "R$5,20", "R$260,00"]]
        for r, row in enumerate(rows, start=1):
            for c, v in enumerate(row):
                ctk.CTkLabel(table, text=v, text_color=CORES["text_primary"]).grid(row=r, column=c, padx=8, pady=6)

    def _build_reports_page(self, parent):
        parent.pack_propagate(False)
        ctk.CTkLabel(parent, text="📊 Relatórios", font=FONT_TITLE, text_color=CORES["text_primary"]).pack(anchor="nw", pady=12, padx=12)
        fig = Figure(figsize=(6,3), dpi=100)
        ax = fig.add_subplot(111)
        if self.df is not None and len(self.df) > 0:
            df = self.df.copy()
            df['Total Bruto'] = df['Qtd.'].apply(self._to_float) * df['Valor Atual'].apply(self._to_float)
            agg = df.groupby('Item')['Total Bruto'].sum().sort_values(ascending=False).head(6)
            items = agg.index.tolist()
            values = agg.values.tolist()
        else:
            items = ["A","B","C","D"]
            values = [random.randint(10,100) for _ in items]
        ax.bar(items, values, color=CORES["accent_alt"]) 
        ax.set_title("Vendas por item")
        ax.grid(axis='y', linestyle='--', alpha=0.3)
        canvas = FigureCanvas(fig, master=parent)
        canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True, padx=12, pady=12)

    def _build_caixas_page(self, parent):
        parent.pack_propagate(False)
        ctk.CTkLabel(parent, text="📦 Caixas", font=FONT_TITLE, text_color=CORES["text_primary"]).pack(anchor="nw", pady=12, padx=12)
        table = ctk.CTkFrame(parent, fg_color=CORES["card_bg"], corner_radius=8)
        table.pack(fill=tk.BOTH, expand=True, padx=12, pady=12)
        headers = ["Caixa", "Quantidade", "Valor Médio", "Valor Total"]
        for col, h in enumerate(headers):
            lbl = ctk.CTkLabel(table, text=h, font=FONT_SMALL_BOLD, text_color=CORES["text_primary"]) 
            lbl.grid(row=0, column=col, padx=8, pady=8)
        caixas = [
            ["Caixa Fraturada", "120", "R$2,80", "R$336,00"],
            ["Caixa CS20", "50", "R$5,20", "R$260,00"],
        ]
        for r, row in enumerate(caixas, start=1):
            for c, v in enumerate(row):
                ctk.CTkLabel(table, text=v, text_color=CORES["text_primary"]).grid(row=r, column=c, padx=8, pady=6)

    def _build_reports_page(self, parent):
        parent.pack_propagate(False)
        ctk.CTkLabel(parent, text="📊 Relatórios", font=FONT_TITLE, text_color=CORES["text_primary"]).pack(anchor="nw", pady=12, padx=12)
        fig = Figure(figsize=(6,3), dpi=100)
        ax = fig.add_subplot(111)
        items = ["A","B","C","D"]
        values = [random.randint(10,100) for _ in items]
        ax.bar(items, values, color=CORES["accent_alt"]) 
        ax.set_title("Vendas por categoria")
        ax.grid(axis='y', linestyle='--', alpha=0.3)
        canvas = FigureCanvas(fig, master=parent)
        canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True, padx=12, pady=12)

    def show_settings(self):
        self.clear_center()
        ctk.CTkLabel(self.center_frame, text="⚙️ Configurações", font=FONT_TITLE, text_color=CORES["text_primary"]).pack(pady=20)
        ctk.CTkButton(self.center_frame, text="Abrir Configurações", command=self.abrir_configuracoes, font=FONT_BUTTON).pack(pady=8)
    
    # Log UI updater removed (logs are backend-only)
    
    # Log UI helpers removed; log actions now go to LogManager backend only
    
    def _to_float(self, value, default=0.0):
        """Converte valores vindos do Excel/SQLite para float."""
        if pd.isna(value):
            return default
        if isinstance(value, str):
            value = value.replace("R$", "").strip()
            if "." in value and "," in value:
                value = value.replace(".", "").replace(",", ".")
            else:
                value = value.replace(",", ".")
            if not value:
                return default
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    def _preparar_dataframe(self):
        """Normaliza colunas usadas pelo inventario e recalcula totais."""
        if self.df is None:
            return

        colunas_obrigatorias = {
            "Item": "",
            "Qtd.": 0,
            "Valor de Compra": 0,
            "Valor Atual": 0,
        }

        for coluna, valor_padrao in colunas_obrigatorias.items():
            if coluna not in self.df.columns:
                self.df[coluna] = valor_padrao

        for coluna in ("Qtd.", "Valor de Compra", "Valor Atual"):
            self.df[coluna] = self.df[coluna].apply(self._to_float)

        self.df["_source_row"] = self.df.index
        self.df.loc[self.df["Valor de Compra"].round(2) == 0.01, "Valor de Compra"] = 0
        self.df["Item"] = self.df["Item"].astype(str).str.strip()
        self.df["Total Compra"] = self.df["Qtd."] * self.df["Valor de Compra"]
        self.df["Total Bruto"] = self.df["Qtd."] * self.df["Valor Atual"]
        self.df["Taxa Steam"] = self.df["Total Bruto"] * 0.15
        self.df["Valor Liquido"] = self.df["Total Bruto"] - self.df["Taxa Steam"] - self.df["Total Compra"]

    def _format_currency(self, value):
        return f"R${value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    def _calcular_totais(self):
        if self.df is None or len(self.df) == 0:
            return {
                "quantity": 0,
                "purchase": 0.0,
                "current": 0.0,
                "fee": 0.0,
                "net": 0.0,
            }

        total_quantity = 0.0
        total_purchase = 0.0
        total_current = 0.0

        for _, row in self.df.iterrows():
            quantity = self._to_float(row.get("Qtd.", 0))
            purchase_price = self._to_float(row.get("Valor de Compra", 0))
            current_price = self._to_float(row.get("Valor Atual", 0))
            if round(purchase_price, 2) == 0.01:
                purchase_price = 0

            total_quantity += quantity
            total_purchase += quantity * purchase_price
            total_current += quantity * current_price

        total_fee = total_current * 0.15
        return {
            "quantity": total_quantity,
            "purchase": total_purchase,
            "current": total_current,
            "fee": total_fee,
            "net": total_current - total_fee,
        }

    def atualizar_totais_topo(self):
        if not hasattr(self, "summary_labels"):
            return

        totals = self._calcular_totais()
        self.summary_labels["quantity"].configure(text=f"{int(totals['quantity'])} un.")
        self.summary_labels["purchase"].configure(text=self._format_currency(totals["purchase"]))
        self.summary_labels["current"].configure(text=self._format_currency(totals["current"]))
        self.summary_labels["fee"].configure(text=self._format_currency(totals["fee"]))
        self.summary_labels["net"].configure(text=self._format_currency(totals["net"]))

    def _filtrar_dataframe_por_busca(self):
        if self.df is None:
            return self.df

        query = self.search_var.get().strip().lower() if hasattr(self, "search_var") else ""
        if not query:
            return self.df

        return self.df[self.df["Item"].astype(str).str.lower().str.contains(query, na=False)]

    def _resetar_pagina_busca(self, *_):
        self.current_page = 0
        self.carregar_cards()

    def invalidar_cache_cards(self):
        self.cards_cache_valid = False
        if hasattr(self, "grid_frame"):
            for child in self.grid_frame.winfo_children():
                child.destroy()
        self.card_widgets = {}

    def _atualizar_controles_paginacao(self, total_items, total_pages):
        if not hasattr(self, "page_label"):
            return

        if total_items == 0:
            self.page_label.configure(text="Página 0/0")
            self.prev_page_button.configure(state="disabled")
            self.next_page_button.configure(state="disabled")
            return

        page_start = self.current_page * self.items_per_page + 1
        page_end = min(page_start + self.items_per_page - 1, total_items)
        self.page_label.configure(
            text=f"Página {self.current_page + 1}/{total_pages} · Itens {page_start}-{page_end} de {total_items}"
        )
        self.prev_page_button.configure(state="normal" if self.current_page > 0 else "disabled")
        self.next_page_button.configure(state="normal" if self.current_page < total_pages - 1 else "disabled")

    def _widget_esta_na_biblioteca(self, widget):
        while widget is not None:
            if widget == getattr(self, "cards_frame", None):
                return True
            widget = getattr(widget, "master", None)
        return False

    def _on_mousewheel_page(self, event):
        if not self._widget_esta_na_biblioteca(event.widget):
            return

        if hasattr(event, "num") and event.num == 4:
            self.pagina_anterior()
        elif hasattr(event, "num") and event.num == 5:
            self.proxima_pagina()
        elif event.delta > 0:
            self.pagina_anterior()
        elif event.delta < 0:
            self.proxima_pagina()

    def pagina_anterior(self):
        if self.current_page > 0:
            self.current_page -= 1
            self.carregar_cards()

    def proxima_pagina(self):
        df_cards = self._filtrar_dataframe_por_busca()
        if df_cards is None or len(df_cards) == 0:
            return

        total_pages = max(1, (len(df_cards) + self.items_per_page - 1) // self.items_per_page)
        if self.current_page < total_pages - 1:
            self.current_page += 1
            self.carregar_cards()

    def abrir_configuracoes(self):
        """Abre janela de configurações"""
        self.log_manager.log_click("open_settings_button")
        
        janela = ctk.CTkToplevel(self.root)
        janela.title("⚙️ Configurações")
        janela.geometry("500x400")
        janela.resizable(False, False)
        
        # Título
        titulo = ctk.CTkLabel(
            janela, text="⚙️ CONFIGURAÇÕES DO SISTEMA", 
            font=FONT_LG_BOLD
        )
        titulo.pack(pady=15)
        
        # Atualização de preços
        frame1 = ctk.CTkFrame(janela, fg_color=CORES["card_bg"])
        frame1.pack(fill=tk.X, padx=20, pady=10)
        
        ctk.CTkLabel(
            frame1, text="🕐 Hora para atualizar preços:", 
            font=FONT_SMALL_BOLD
        ).pack(anchor="w")
        
        time_frame = ctk.CTkFrame(frame1, fg_color=CORES["card_bg"])
        time_frame.pack(fill=tk.X, pady=10)
        
        ctk.CTkLabel(time_frame, text="Hora:").pack(side=tk.LEFT, padx=5)
        hora_var = tk.StringVar(value="10")
        hora_spinbox = ctk.CTkEntry(time_frame, textvariable=hora_var, width=50)
        hora_spinbox.pack(side=tk.LEFT, padx=5)
        
        ctk.CTkLabel(time_frame, text="Minuto:").pack(side=tk.LEFT, padx=5)
        min_var = tk.StringVar(value="00")
        min_spinbox = ctk.CTkEntry(time_frame, textvariable=min_var, width=50)
        min_spinbox.pack(side=tk.LEFT, padx=5)
        
        # Informações do sistema
        frame2 = ctk.CTkFrame(janela, fg_color=CORES["card_bg"])
        frame2.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)
        
        ctk.CTkLabel(
            frame2, text="📊 INFORMAÇÕES DO SISTEMA:", 
            font=FONT_SMALL_BOLD
        ).pack(anchor="w", pady=10)
        
        info_text = scrolledtext.ScrolledText(
            frame2, width=50, height=12,
            bg=CORES["background"], font=LOG_FONT
        )
        info_text.pack(fill=tk.BOTH, expand=True)
        
        info_text.insert(tk.END, f"📝 Logs: {self.log_manager.log_file}\n")
        info_text.insert(tk.END, f"💾 BD: {self.db_manager.db_path}\n")
        info_text.insert(tk.END, f"🎨 Cache: {self.steam_manager.cache_dir}\n")
        info_text.insert(tk.END, f"⏰ Scheduler: Ativo\n")
        info_text.config(state=tk.DISABLED)
        
        # Botão salvar
        def salvar_config():
            try:
                hora = int(hora_var.get())
                minuto = int(min_var.get())
                
                if 0 <= hora <= 23 and 0 <= minuto <= 59:
                    self.scheduler_manager.schedule_daily_update(hora, minuto)
                    self.log_manager.log_action("Settings updated", {"time": f"{hora:02d}:{minuto:02d}"})
                    messagebox.showinfo("Sucesso", "Configurações salvas!")
                    janela.destroy()
                else:
                    messagebox.showerror("Erro", "Hora ou minuto inválido!")
            except:
                messagebox.showerror("Erro", "Digite números válidos!")
        
        ctk.CTkButton(
            janela, text="✅ Salvar Configurações", 
            command=salvar_config,
            fg_color=CORES["secondary"], text_color="white", height=40,
            font=FONT_BUTTON
        ).pack(pady=10, padx=20, fill=tk.X)
    
    def abrir_arquivo(self):
        self.log_manager.log_click("open_file_button")
        
        caminho = filedialog.askopenfilename(
            filetypes=[("Excel files", "*.xlsx *.xls"), ("All files", "*.*")]
        )
        
        if caminho:
            try:
                self.arquivo_aberto = caminho
                self.df = pd.read_excel(caminho, usecols='B:I')
                self.df = self.df.dropna(how='all')
                self.df = self.df[self.df['Item'].notna()]
                self.df = self.df.reset_index(drop=True)
                self._preparar_dataframe()
                self.current_page = 0
                self.invalidar_cache_cards()
                
                self.log_manager.log_action("File opened", {
                    "file": os.path.basename(caminho),
                    "items": len(self.df)
                })
                
                self.status_label.configure(
                    text=f"✅ {os.path.basename(caminho)} | {len(self.df)} itens"
                )
                self.log_na_ui(f"✅ Arquivo aberto: {os.path.basename(caminho)}", "SUCCESS")
                
                self.carregar_cards()
                
                # Buscar imagens em background
                thread = threading.Thread(target=self._buscar_imagens_automaticamente, daemon=True)
                thread.start()
            except Exception as e:
                self.log_manager.log_error(str(e), "abrir_arquivo")
                self.log_na_ui(f"❌ Erro: {str(e)}", "ERROR")
                messagebox.showerror("Erro", f"Erro ao abrir arquivo: {e}")
    
    def _carregar_arquivo_automatico(self):
        """Carrega automaticamente o arquivo padrão ao iniciar"""
        arquivo_padrao = "Do Zero Ao Milhão.xlsx"
        if os.path.exists(arquivo_padrao):
            try:
                self.log_na_ui(f"📂 Carregando arquivo padrão...", "INFO")
                self.arquivo_aberto = arquivo_padrao
                self.df = pd.read_excel(arquivo_padrao, usecols='B:I')
                self.df = self.df.dropna(how='all')
                self.df = self.df[self.df['Item'].notna()]
                self.df = self.df.reset_index(drop=True)
                self._preparar_dataframe()
                self.current_page = 0
                self.invalidar_cache_cards()
                
                self.log_manager.log_action("Default file loaded", {
                    "file": arquivo_padrao,
                    "items": len(self.df)
                })
                
                self.status_label.configure(
                    text=f"✅ {arquivo_padrao} | {len(self.df)} itens"
                )
                self.log_na_ui(f"✅ Arquivo carregado: {arquivo_padrao} ({len(self.df)} itens)", "SUCCESS")
                
                self.carregar_cards()
                
                # Buscar imagens em background
                thread = threading.Thread(target=self._buscar_imagens_automaticamente, daemon=True)
                thread.start()
            except Exception as e:
                self.log_manager.log_error(str(e), "_carregar_arquivo_automatico")
                self.log_na_ui(f"❌ Erro ao carregar arquivo: {str(e)}", "ERROR")
    
    def _buscar_imagens_automaticamente(self):
        """Busca imagens de todos os itens em background"""
        if self.df is None or len(self.df) == 0:
            return
        
        self.log_na_ui("🖼️ Iniciando busca de imagens...", "INFO")
        total_items = len(self.df)
        itens_com_imagem = 0
        
        for idx, (i, row) in enumerate(self.df.iterrows()):
            item_name = str(row.get('Item', 'Sem nome')).strip()
            source_row = int(row.get('_source_row', i))
            
            try:
                # Verificar se item já está no banco
                item_db = self.db_manager.get_item(item_name, source_row=source_row)
                
                if not item_db:
                    # Buscar item no Steam
                    steam_data = self.steam_manager.search_item_on_steam(item_name)
                    
                    if steam_data:
                        # Adicionar ao banco
                        item_id = self.db_manager.add_item(
                            steam_data['name'],
                            quantity=self._to_float(row.get('Qtd.', 0)),
                            purchase_price=0 if round(self._to_float(row.get('Valor de Compra', 0)), 2) == 0.01 else self._to_float(row.get('Valor de Compra', 0)),
                            current_price=self._to_float(row.get('Valor Atual', 0)),
                            steam_market_url=steam_data.get('market_url'),
                            source_row=source_row
                        )
                        
                        image_filename = None
                        if steam_data.get('image_url'):
                            image_filename = self.steam_manager.download_image(
                                steam_data['image_url'], 
                                steam_data['name']
                            )
                            itens_com_imagem += 1
                        
                        # Atualizar com dados da Steam (incluindo market_url)
                        self.db_manager.update_item(item_id, 
                            steam_item_id=steam_data['steam_id'],
                            steam_market_url=steam_data.get('market_url'),
                            image_filename=image_filename
                        )
                        
                        self.log_na_ui(f"✅ [{idx+1}/{total_items}] {item_name}", "SUCCESS")
                    else:
                        self.db_manager.add_item(
                            item_name,
                            quantity=self._to_float(row.get('Qtd.', 0)),
                            purchase_price=0 if round(self._to_float(row.get('Valor de Compra', 0)), 2) == 0.01 else self._to_float(row.get('Valor de Compra', 0)),
                            current_price=self._to_float(row.get('Valor Atual', 0)),
                            source_row=source_row
                        )
                        self.log_na_ui(f"⚠️ [{idx+1}/{total_items}] {item_name} salvo sem dados Steam", "ERROR")
                else:
                    # Item já existe, verificar se tem imagem e dados
                    item_id = item_db[0]
                    image_filename = item_db[6]
                    steam_item_id = item_db[7]
                    steam_market_url = item_db[8] if len(item_db) > 8 else None
                    image_low_quality = self.steam_manager.is_low_quality_image(image_filename)
                    steam_data_mismatch = self.steam_manager.is_item_data_mismatched(
                        item_name,
                        steam_id=steam_item_id,
                        steam_market_url=steam_market_url,
                    )
                    self.db_manager.update_item(
                        item_id,
                        quantity=self._to_float(row.get('Qtd.', 0)),
                        purchase_price=0 if round(self._to_float(row.get('Valor de Compra', 0)), 2) == 0.01 else self._to_float(row.get('Valor de Compra', 0)),
                        current_price=self._to_float(row.get('Valor Atual', 0))
                    )
                    
                    if not image_filename or not steam_market_url or image_low_quality or steam_data_mismatch:
                        steam_data = self.steam_manager.search_item_on_steam(item_name)
                        if steam_data:
                            update_dict = {}
                            
                            if (not image_filename or image_low_quality or steam_data_mismatch) and steam_data.get('image_url'):
                                image_filename = self.steam_manager.download_image(
                                    steam_data['image_url'], 
                                    item_name
                                )
                                update_dict['image_filename'] = image_filename
                                itens_com_imagem += 1
                            
                            if steam_data.get('steam_id'):
                                update_dict['steam_item_id'] = steam_data.get('steam_id')

                            if steam_data.get('market_url'):
                                update_dict['steam_market_url'] = steam_data.get('market_url')
                            
                            if update_dict:
                                self.db_manager.update_item(item_id, **update_dict)
                            
                            self.log_na_ui(f"✅ [{idx+1}/{total_items}] {item_name}", "SUCCESS")
                        else:
                            self.log_na_ui(f"⚠️ [{idx+1}/{total_items}] {item_name} (não encontrado)", "ERROR")
                    else:
                        itens_com_imagem += 1
                        self.log_na_ui(f"✅ [{idx+1}/{total_items}] {item_name}", "SUCCESS")
                
                # Pequena pausa para não sobrecarregar
                time.sleep(0.1)
                
            except Exception as e:
                self.log_manager.log_error(str(e), f"_buscar_imagens: {item_name}")
                self.log_na_ui(f"❌ [{idx+1}/{total_items}] Erro: {item_name}", "ERROR")
        
        self.log_na_ui(f"✅ Busca concluída! {itens_com_imagem}/{total_items} com imagem", "SUCCESS")
        
        # Recarregar cards para mostrar as imagens
        self.invalidar_cache_cards()
        self.root.after(500, self.carregar_cards)
    
    def carregar_cards(self):
        """Carrega cards dos itens"""
        self.atualizar_totais_topo()

        df_cards = self._filtrar_dataframe_por_busca()

        if not hasattr(self, "grid_frame"):
            self.grid_frame = ctk.CTkFrame(self.cards_frame, fg_color=CORES["background"])
            self.grid_frame.pack(fill=tk.BOTH, expand=True, padx=4)

        for child in self.grid_frame.winfo_children():
            child.destroy()

        self.card_widgets = {}
        if self.empty_state_label is not None:
            self.empty_state_label.destroy()
            self.empty_state_label = None

        if df_cards is None or len(df_cards) == 0:
            self._atualizar_controles_paginacao(0, 0)
            mensagem = "📭 Nenhum item no inventário"
            if self.df is not None and len(self.df) > 0:
                mensagem = "🔍 Nenhum item encontrado"
            self.empty_state_label = ctk.CTkLabel(
                self.cards_frame,
                text=mensagem,
                font=FONT_LG_BOLD,
                text_color=CORES["text_secondary"]
            )
            self.empty_state_label.pack(pady=50)
            return

        total_items = len(df_cards)
        total_pages = max(1, (total_items + self.items_per_page - 1) // self.items_per_page)
        self.current_page = max(0, min(self.current_page, total_pages - 1))
        start = self.current_page * self.items_per_page
        end = start + self.items_per_page
        df_page = df_cards.iloc[start:end]
        self._atualizar_controles_paginacao(total_items, total_pages)

        content_width = max(self.cards_frame.winfo_width(), 980)
        columns = max(1, min(3, len(df_page), content_width // 300))
        card_width = max(270, (content_width - 40) // columns)

        for column in range(columns):
            self.grid_frame.grid_columnconfigure(column, weight=1, minsize=card_width)
        
        for idx, (i, row) in enumerate(df_page.iterrows()):
            col = idx % columns
            row_num = idx // columns
            source_row = int(row.get("_source_row", i))
            card = self.criar_card(self.grid_frame, idx, row)
            card.grid(row=row_num, column=col, padx=5, pady=5, sticky="nsew", ipadx=5, ipady=5)
            self.card_widgets[source_row] = card

    def _construir_cache_cards(self):
        # A construção de cards de todos os itens pode travar o PC em bases grandes.
        # Agora os cards são criados apenas para a página visível.
        self.cards_cache_valid = True
    
    def criar_card(self, parent, idx, row):
        """Cria card detalhado padronizado no estilo antigo."""
        card = ctk.CTkFrame(parent, fg_color=CORES["card_bg"], corner_radius=12, width=320)

        item_name = str(row.get('Item', 'Sem nome')).strip()
        source_row = int(row.get('_source_row', idx))
        item_db = self.db_manager.get_item(item_name, source_row=source_row)
        image_db = item_db
        last_update = item_db[10] if item_db else None

        card_top = ctk.CTkFrame(card, fg_color=CORES["card_bg"], corner_radius=6)
        card_top.pack(fill=tk.X, pady=(6, 4), padx=6)

        image_label = ctk.CTkLabel(
            card_top, text="📸", font=FONT_ICON,
            text_color=CORES["text_secondary"], width=90, height=76
        )
        image_label.pack(side=tk.LEFT, padx=(0,12))

        qtd = self._to_float(row.get('Qtd.', 0))
        badge = ctk.CTkLabel(card_top, text=f"{int(qtd)} un.", fg_color=CORES["accent_alt"], text_color=CORES["card_bg"], corner_radius=12)
        badge.pack(side=tk.RIGHT, padx=6, pady=6)

        image_filename = image_db[6] if image_db else None
        if image_db and image_filename:
            image_path = self.steam_manager.get_image_path(image_filename)
            if image_path and image_path.exists():
                try:
                    pil_image = Image.open(image_path)
                    pil_image = ImageOps.contain(pil_image, (180, 70), Image.Resampling.LANCZOS)
                    canvas_image = Image.new("RGBA", (180, 70), (0, 0, 0, 0))
                    x = (180 - pil_image.width) // 2
                    y = (70 - pil_image.height) // 2
                    canvas_image.paste(pil_image.convert("RGBA"), (x, y))
                    photo_image = ImageTk.PhotoImage(canvas_image)
                    image_label.configure(image=photo_image, text="")
                    image_label.image = photo_image
                except Exception as e:
                    self.log_manager.log_error(str(e), f"load_item_image: {item_name}")

        nome_label = ctk.CTkLabel(
            card, text=item_name, font=FONT_CARD_TITLE,
            text_color=CORES["text_primary"], wraplength=260,
            justify="left"
        )
        nome_label.pack(fill=tk.X, pady=(0, 6), padx=12, anchor="w")

        qtd = self._to_float(row.get('Qtd.', 0))
        valor_compra = self._to_float(row.get('Valor de Compra', 0))
        if round(valor_compra, 2) == 0.01:
            valor_compra = 0
        total_compra = qtd * valor_compra
        valor_atual = self._to_float(row.get('Valor Atual', 0))
        total = qtd * valor_atual
        taxa_steam = total * 0.15 if total > 0 else 0
        valor_liquido = total - taxa_steam - total_compra
        liquido_negativo = valor_liquido < 0

        info_frame = ctk.CTkFrame(card, fg_color=CORES["card_bg"], corner_radius=4)
        info_frame.pack(fill=tk.X, padx=1, pady=1)

        self.criar_info_row(info_frame, "📦 Qtd.:", f"{int(qtd)} un.", CORES["accent_alt"])
        self.criar_info_row(info_frame, "💵 Compra un.:", self._format_currency(valor_compra), CORES["text_secondary"])
        self.criar_info_row(info_frame, "🧾 Compra total:", self._format_currency(total_compra), CORES["text_secondary"])
        self.criar_info_row(info_frame, "💎 Atual:", self._format_currency(valor_atual), CORES["text_primary"])

        self.criar_destaque_row(info_frame, "💰 Total Bruto:", self._format_currency(total), CORES["card_bg"], CORES["accent_alt"])
        self.criar_destaque_row(info_frame, "🔴 Taxa Steam (15%):", self._format_currency(taxa_steam), CORES["warning"], CORES["card_bg"])
        self.criar_destaque_row(
            info_frame,
            "🟢 Valor Líquido:",
            self._format_currency(valor_liquido),
            CORES["accent"] if liquido_negativo else CORES["success"],
            CORES["card_bg"]
        )

        update_text = "--"
        if last_update:
            try:
                last_update_dt = datetime.fromisoformat(last_update.replace('Z', '+00:00'))
                update_text = last_update_dt.strftime("%d/%m/%Y %H:%M")
            except ValueError:
                update_text = str(last_update)
        self.criar_info_row(info_frame, "⏰ Atualizado:", update_text, CORES["text_secondary"])

        button_frame = ctk.CTkFrame(card, fg_color=CORES["card_bg"])
        button_frame.pack(fill=tk.X, pady=(2, 0), padx=1)

        ctk.CTkButton(
            button_frame, text="✏️",
            command=lambda: self.editar_item(source_row),
            fg_color=CORES["accent_alt"], text_color=CORES["card_bg"],
            height=28, font=FONT_SMALL_BOLD, corner_radius=8
        ).pack(side=tk.LEFT, padx=6, expand=False)

        ctk.CTkButton(
            button_frame, text="❌",
            command=lambda: self.deletar_item(source_row, item_name),
            fg_color=CORES["warning"], text_color=CORES["card_bg"],
            height=28, font=FONT_SMALL_BOLD, corner_radius=8
        ).pack(side=tk.LEFT, padx=6, expand=False)

        ctk.CTkButton(
            button_frame, text="🔄",
            command=lambda: self.atualizar_preco_item(source_row, item_name),
            fg_color=CORES["accent"], text_color=CORES["card_bg"],
            height=28, font=FONT_SMALL_BOLD, corner_radius=8
        ).pack(side=tk.LEFT, padx=6, expand=False)

        # Efeito hover: escurece levemente o card ao passar o mouse
        def _on_enter(e):
            try:
                card.configure(fg_color=CARD_HOVER)
            except Exception:
                pass

        def _on_leave(e):
            try:
                card.configure(fg_color=CORES["card_bg"])
            except Exception:
                pass

        card.bind("<Enter>", _on_enter)
        card.bind("<Leave>", _on_leave)

        return card

    def criar_destaque_row(self, parent, label, value, bg_color, value_color):
        """Cria linha destacada padronizada para total, taxa e liquido."""
        row_frame = ctk.CTkFrame(parent, fg_color=bg_color, corner_radius=3)
        row_frame.pack(fill=tk.X, pady=1, ipady=0, ipadx=3)

        label_color = "white" if bg_color != CORES["border"] else CORES["text_primary"]
        ctk.CTkLabel(
            row_frame, text=label, font=FONT_SMALL_BOLD,
            text_color=label_color
        ).pack(side=tk.LEFT)

        ctk.CTkLabel(
            row_frame, text=value, font=FONT_SMALL_BOLD,
            text_color=value_color
        ).pack(side=tk.RIGHT)
    
    def criar_info_row(self, parent, label, value, color):
        """Cria linha de informação no card"""
        row_frame = ctk.CTkFrame(parent, fg_color=CORES["card_bg"], corner_radius=6)
        row_frame.pack(fill=tk.X, pady=0)
        
        ctk.CTkLabel(
            row_frame, text=label, font=FONT_SMALL_BOLD,
            text_color=CORES["text_primary"]
        ).pack(side=tk.LEFT)
        
        ctk.CTkLabel(
            row_frame, text=value, font=FONT_SMALL,
            text_color=color
        ).pack(side=tk.RIGHT)

    def deletar_item(self, source_row, item_name):
        """Remove uma linha do inventario e o registro correspondente do banco."""
        self.log_manager.log_click(f"delete_item_{source_row}")

        if self.df is None:
            messagebox.showwarning("Aviso", "Carregue um arquivo primeiro!")
            return

        confirmar = messagebox.askyesno(
            "Confirmar exclusão",
            f"Deseja deletar o item?\n\n{item_name}"
        )
        if not confirmar:
            return

        try:
            item_db = self.db_manager.get_item(item_name, source_row=source_row)
            if item_db:
                self.db_manager.delete_item(item_db[0])

            mask = self.df["_source_row"] == source_row
            if mask.any():
                self.df = self.df.loc[~mask].reset_index(drop=True)
            else:
                self.log_manager.log_error(
                    f"Source row not found in DataFrame: {source_row}",
                    f"deletar_item: {item_name}"
                )

            self.invalidar_cache_cards()
            self.carregar_cards()
            self.log_na_ui(f"✅ Item deletado: {item_name}", "SUCCESS")
        except Exception as e:
            self.log_manager.log_error(str(e), f"deletar_item: {item_name}")
            messagebox.showerror("Erro", f"Erro ao deletar item: {e}")
    
    def adicionar_item(self):
        self.log_manager.log_click("add_item_button")
        self.log_na_ui("➕ Adicionando novo item...", "INFO")

        janela = ctk.CTkToplevel(self.root)
        janela.title("Novo Item")
        janela.geometry("520x540")
        janela.resizable(False, False)
        janela.transient(self.root)
        janela.grab_set()
        janela.grid_columnconfigure(0, weight=1)
        janela.grid_rowconfigure(1, weight=1)

        title_label = ctk.CTkLabel(
            janela, text="Novo item", font=FONT_LG_BOLD,
            text_color=CORES["text_primary"]
        )
        title_label.grid(row=0, column=0, sticky="w", padx=20, pady=(18, 10))

        form_frame = ctk.CTkFrame(janela, fg_color=CORES["card_bg"])
        form_frame.grid(row=1, column=0, sticky="nsew", padx=20, pady=8)

        button_frame = ctk.CTkFrame(janela, fg_color=CORES["background"])
        button_frame.grid(row=2, column=0, sticky="ew", padx=20, pady=(4, 18))

        campos = {}

        def add_field(label, key, value=""):
            ctk.CTkLabel(
                form_frame, text=label, font=FONT_SMALL_BOLD,
                text_color=CORES["text_primary"]
            ).pack(anchor="w", padx=12, pady=(8, 2))
            entry = ctk.CTkEntry(form_frame, height=32, font=FONT_BODY)
            entry.insert(0, str(value))
            entry.pack(fill=tk.X, padx=12)
            campos[key] = entry

        add_field("Nome", "name")
        add_field("Quantidade", "quantity", "1")
        add_field("Valor de compra unitário", "purchase_price", "0")
        add_field("Valor atual unitário", "current_price", "0")
        add_field("Link do Mercado Steam", "steam_market_url")

        def salvar_novo_item():
            try:
                nome = campos["name"].get().strip()
                if not nome:
                    messagebox.showerror("Erro", "O nome não pode ficar vazio.")
                    return

                quantidade = self._to_float(campos["quantity"].get())
                valor_compra = self._to_float(campos["purchase_price"].get())
                valor_atual = self._to_float(campos["current_price"].get())
                if quantidade < 0 or valor_compra < 0 or valor_atual < 0:
                    messagebox.showerror("Erro", "Quantidade e valores não podem ser negativos.")
                    return

                if round(valor_compra, 2) == 0.01:
                    valor_compra = 0
                steam_market_url = campos["steam_market_url"].get().strip()

                if self.df is None:
                    self.df = pd.DataFrame(columns=[
                        "Item", "Qtd.", "Valor de Compra", "Valor Atual",
                        "Total Compra", "Total Bruto", "Taxa Steam", "Valor Liquido",
                        "_source_row"
                    ])

                if "_source_row" not in self.df.columns:
                    self.df["_source_row"] = self.df.index

                source_rows = pd.to_numeric(self.df["_source_row"], errors="coerce").dropna()
                if len(source_rows) == 0:
                    source_row = 0
                else:
                    source_row = int(source_rows.max()) + 1

                total_compra = quantidade * valor_compra
                total_bruto = quantidade * valor_atual
                taxa_steam = total_bruto * 0.15
                valor_liquido = total_bruto - taxa_steam - total_compra

                nova_linha = {coluna: pd.NA for coluna in self.df.columns}
                nova_linha.update({
                    "Item": nome,
                    "Qtd.": quantidade,
                    "Valor de Compra": valor_compra,
                    "Valor Atual": valor_atual,
                    "Total Compra": total_compra,
                    "Total Bruto": total_bruto,
                    "Taxa Steam": taxa_steam,
                    "Valor Liquido": valor_liquido,
                    "_source_row": source_row,
                })

                if "Total de Compra" in self.df.columns:
                    nova_linha["Total de Compra"] = total_compra
                if "Total" in self.df.columns:
                    nova_linha["Total"] = total_bruto
                if "PNL" in self.df.columns:
                    nova_linha["PNL"] = ((valor_liquido - total_compra) / total_compra) if total_compra else 0

                self.df.loc[len(self.df)] = nova_linha
                self.db_manager.add_item(
                    nome,
                    quantity=quantidade,
                    purchase_price=valor_compra,
                    current_price=valor_atual,
                    steam_market_url=steam_market_url or None,
                    source_row=source_row,
                )

                self.log_na_ui(f"✅ Item adicionado: {nome}", "SUCCESS")
                janela.destroy()
                self.invalidar_cache_cards()
                self.carregar_cards()
            except Exception as e:
                self.log_manager.log_error(str(e), "adicionar_item")
                messagebox.showerror("Erro", f"Erro ao adicionar item: {e}")

        ctk.CTkButton(
            button_frame, text="Cancelar", command=janela.destroy,
            fg_color=CORES["text_secondary"], text_color="white",
            height=36, font=FONT_BUTTON
        ).pack(side=tk.LEFT, padx=4, expand=True, fill=tk.X)

        ctk.CTkButton(
            button_frame, text="Salvar item", command=salvar_novo_item,
            fg_color=CORES["success"], text_color="white",
            height=36, font=FONT_BUTTON
        ).pack(side=tk.LEFT, padx=4, expand=True, fill=tk.X)

    def editar_item(self, source_row):
        """Edita os dados de uma linha do inventário."""
        self.log_manager.log_click(f"edit_item_{source_row}")

        if self.df is None:
            messagebox.showwarning("Aviso", "Carregue um arquivo primeiro!")
            return

        match = self.df[self.df["_source_row"] == source_row]
        if match.empty:
            messagebox.showerror("Erro", "Item não encontrado para edição.")
            return

        row_index = match.index[0]
        row = self.df.loc[row_index]
        item_name = str(row.get("Item", "")).strip()
        item_db = self.db_manager.get_item(item_name, source_row=source_row)

        janela = ctk.CTkToplevel(self.root)
        janela.title("Editar Item")
        janela.geometry("520x430")
        janela.resizable(False, False)
        janela.transient(self.root)
        janela.grab_set()

        ctk.CTkLabel(
            janela, text="Editar item", font=FONT_LG_BOLD,
            text_color=CORES["text_primary"]
        ).pack(anchor="w", padx=20, pady=(18, 10))

        form_frame = ctk.CTkFrame(janela, fg_color=CORES["card_bg"])
        form_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=8)

        campos = {}

        def add_field(label, key, value):
            ctk.CTkLabel(
                form_frame, text=label, font=FONT_SMALL_BOLD,
                text_color=CORES["text_primary"]
            ).pack(anchor="w", padx=12, pady=(8, 2))
            entry = ctk.CTkEntry(form_frame, height=32, font=FONT_BODY)
            entry.insert(0, str(value))
            entry.pack(fill=tk.X, padx=12)
            campos[key] = entry

        add_field("Nome", "name", item_name)
        add_field("Quantidade", "quantity", self._to_float(row.get("Qtd.", 0)))
        add_field("Valor de compra unitário", "purchase_price", self._format_currency(self._to_float(row.get("Valor de Compra", 0))))
        add_field("Valor atual unitário", "current_price", self._format_currency(self._to_float(row.get("Valor Atual", 0))))
        add_field("Link do Mercado Steam", "steam_market_url", item_db[8] if item_db else "")

        button_frame = ctk.CTkFrame(janela, fg_color=CORES["background"])
        button_frame.pack(fill=tk.X, padx=20, pady=(4, 18))

        def salvar_edicao():
            try:
                novo_nome = campos["name"].get().strip()
                if not novo_nome:
                    messagebox.showerror("Erro", "O nome não pode ficar vazio.")
                    return

                quantidade = self._to_float(campos["quantity"].get())
                valor_compra = self._to_float(campos["purchase_price"].get())
                valor_atual = self._to_float(campos["current_price"].get())
                if round(valor_compra, 2) == 0.01:
                    valor_compra = 0
                steam_market_url = campos["steam_market_url"].get().strip()

                self.df.loc[row_index, "Item"] = novo_nome
                self.df.loc[row_index, "Qtd."] = quantidade
                self.df.loc[row_index, "Valor de Compra"] = valor_compra
                self.df.loc[row_index, "Valor Atual"] = valor_atual
                self.df.loc[row_index, "Total Compra"] = quantidade * valor_compra
                self.df.loc[row_index, "Total Bruto"] = quantidade * valor_atual
                self.df.loc[row_index, "Taxa Steam"] = quantidade * valor_atual * 0.15
                self.df.loc[row_index, "Valor Liquido"] = (quantidade * valor_atual) - (quantidade * valor_atual * 0.15) - (quantidade * valor_compra)

                if item_db:
                    self.db_manager.update_item(
                        item_db[0],
                        source_row=source_row,
                        quantity=quantidade,
                        purchase_price=valor_compra,
                        current_price=valor_atual,
                        steam_market_url=steam_market_url or None,
                    )
                    if novo_nome != item_name:
                        conn = self.db_manager.get_connection()
                        cursor = conn.cursor()
                        cursor.execute("UPDATE items SET name = ? WHERE id = ?", (novo_nome, item_db[0]))
                        conn.commit()
                        conn.close()
                else:
                    self.db_manager.add_item(
                        novo_nome,
                        quantity=quantidade,
                        purchase_price=valor_compra,
                        current_price=valor_atual,
                        steam_market_url=steam_market_url or None,
                        source_row=source_row,
                    )

                self.log_na_ui(f"✅ Item editado: {novo_nome}", "SUCCESS")
                janela.destroy()
                self.invalidar_cache_cards()
                self.carregar_cards()
            except Exception as e:
                self.log_manager.log_error(str(e), f"editar_item: {item_name}")
                messagebox.showerror("Erro", f"Erro ao salvar edição: {e}")

        ctk.CTkButton(
            button_frame, text="Cancelar", command=janela.destroy,
            fg_color=CORES["text_secondary"], text_color="white",
            height=36, font=FONT_BUTTON
        ).pack(side=tk.LEFT, padx=4, expand=True, fill=tk.X)

        ctk.CTkButton(
            button_frame, text="Salvar", command=salvar_edicao,
            fg_color=CORES["success"], text_color="white",
            height=36, font=FONT_BUTTON
        ).pack(side=tk.LEFT, padx=4, expand=True, fill=tk.X)
    
    def salvar_arquivo(self):
        self.log_manager.log_click("save_file_button")
        self.log_na_ui("💾 Salvando arquivo...", "INFO")
        messagebox.showinfo("Salvar", "Arquivo salvo com sucesso!")

    def _aplicar_preco_atualizado(self, item_id, source_row, item_name, new_price):
        self.db_manager.update_item(
            item_id,
            current_price=new_price,
            last_price_update=datetime.now().isoformat()
        )

        if self.df is not None:
            mask = self.df["_source_row"] == source_row
            if mask.any():
                self.df.loc[mask, "Valor Atual"] = new_price
                self.df.loc[mask, "Total Bruto"] = self.df.loc[mask, "Qtd."] * new_price
                self.df.loc[mask, "Taxa Steam"] = self.df.loc[mask, "Total Bruto"] * 0.15
                self.df.loc[mask, "Valor Liquido"] = self.df.loc[mask, "Total Bruto"] - self.df.loc[mask, "Taxa Steam"] - self.df.loc[mask, "Total Compra"]

        self.log_na_ui(f"✅ Preço atualizado: {item_name} - R${new_price:.2f}", "SUCCESS")
        self.invalidar_cache_cards()

    def _garantir_item_steam(self, item_name, source_row, row=None):
        item_db = self.db_manager.get_item(item_name, source_row=source_row)
        if item_db and item_db[7] and not self.steam_manager.is_item_data_mismatched(
            item_name,
            steam_id=item_db[7],
            steam_market_url=item_db[8],
        ):
            return item_db

        steam_data = self.steam_manager.search_item_on_steam(item_name)
        if not steam_data:
            return item_db

        if item_db:
            item_id = item_db[0]
        else:
            quantity = self._to_float(row.get("Qtd.", 0)) if row is not None else 0
            purchase_price = self._to_float(row.get("Valor de Compra", 0)) if row is not None else 0
            current_price = self._to_float(row.get("Valor Atual", 0)) if row is not None else 0
            item_id = self.db_manager.add_item(
                steam_data["name"],
                quantity=quantity,
                purchase_price=purchase_price,
                current_price=current_price,
                steam_market_url=steam_data.get("market_url"),
                source_row=source_row,
            )

        image_filename = item_db[6] if item_db else None
        if not image_filename and steam_data.get("image_url"):
            image_filename = self.steam_manager.download_image(steam_data["image_url"], item_name)

        self.db_manager.update_item(
            item_id,
            steam_item_id=steam_data["steam_id"],
            steam_market_url=steam_data.get("market_url"),
            image_filename=image_filename,
        )
        return self.db_manager.get_item(item_name, source_row=source_row)

    def atualizar_precos_todos(self):
        """Atualiza o valor atual de todas as linhas do inventário."""
        self.log_manager.log_click("update_all_prices_button")

        if self.df is None or len(self.df) == 0:
            messagebox.showwarning("Aviso", "Carregue um arquivo primeiro!")
            return

        if hasattr(self, "update_all_button"):
            self.update_all_button.configure(state="disabled", text="Atualizando...")

        def atualizar():
            total = len(self.df)
            atualizados = 0
            falhas = 0
            price_cache = {}
            rate_limited = False
            self.log_na_ui(f"🔄 Atualizando preços de {total} itens...", "INFO")

            for pos, (_, row) in enumerate(self.df.iterrows(), start=1):
                item_name = str(row.get("Item", "Sem nome")).strip()
                source_row = int(row.get("_source_row", pos - 1))

                try:
                    item_db = self._garantir_item_steam(item_name, source_row, row)
                    if not item_db or not item_db[7]:
                        falhas += 1
                        self.log_na_ui(f"⚠️ [{pos}/{total}] Sem dados Steam: {item_name}", "ERROR")
                        continue

                    steam_item_id = item_db[7]
                    if steam_item_id in price_cache:
                        new_price = price_cache[steam_item_id]
                    else:
                        new_price = self.steam_manager.get_item_price(steam_item_id)
                        price_cache[steam_item_id] = new_price
                        time.sleep(2.0)

                    if new_price is None:
                        steam_data = self.steam_manager.search_item_on_steam(item_name)
                        resolved_id = steam_data.get("steam_id") if steam_data else None
                        if resolved_id and resolved_id != steam_item_id:
                            self.db_manager.update_item(
                                item_db[0],
                                steam_item_id=resolved_id,
                                steam_market_url=steam_data.get("market_url"),
                            )
                            item_db = self.db_manager.get_item(item_name, source_row=source_row)
                            if resolved_id in price_cache:
                                new_price = price_cache[resolved_id]
                            else:
                                new_price = self.steam_manager.get_item_price(resolved_id)
                                price_cache[resolved_id] = new_price
                                time.sleep(2.0)

                    if new_price is None:
                        falhas += 1
                        self.log_na_ui(f"⚠️ [{pos}/{total}] Sem preço/última venda, valor antigo mantido: {item_name}", "ERROR")
                        continue

                    self._aplicar_preco_atualizado(item_db[0], source_row, item_name, new_price)
                    atualizados += 1
                except SteamRateLimitError:
                    rate_limited = True
                    self.log_na_ui("⚠️ Steam limitou as consultas. Atualização pausada; tente novamente em alguns minutos.", "ERROR")
                    break
                except Exception as e:
                    falhas += 1
                    self.log_manager.log_error(str(e), f"atualizar_precos_todos: {item_name}")
                    self.log_na_ui(f"❌ [{pos}/{total}] Erro: {item_name}", "ERROR")

            if rate_limited:
                self.log_na_ui(f"⚠️ Atualização interrompida: {atualizados} atualizados, {falhas} falhas", "ERROR")
            else:
                self.log_na_ui(f"✅ Atualização concluída: {atualizados} atualizados, {falhas} falhas", "SUCCESS")
            self.root.after(0, self.carregar_cards)
            if hasattr(self, "update_all_button"):
                self.root.after(0, lambda: self.update_all_button.configure(state="normal", text="🔄 Atualizar"))

        thread = threading.Thread(target=atualizar, daemon=True)
        thread.start()
    
    def atualizar_preco_item(self, source_row, item_name):
        """Atualiza preço de um item específico via Steam"""
        self.log_manager.log_click(f"update_price_{source_row}")
        
        def atualizar():
            try:
                self.log_na_ui(f"🔄 Atualizando preço: {item_name}", "INFO")
                
                row = None
                if self.df is not None:
                    match = self.df[self.df["_source_row"] == source_row]
                    if not match.empty:
                        row = match.iloc[0]

                item_db = self._garantir_item_steam(item_name, source_row, row)
                
                if item_db:
                    item_id, db_source_row, name, quantity, purchase_price, current_price, image_filename, steam_item_id, steam_market_url, steam_sale_fee, last_update, created_at = item_db
                    
                    if steam_item_id and not image_filename:
                        steam_data_img = self.steam_manager.search_item_on_steam(item_name)
                        if steam_data_img and steam_data_img.get('image_url'):
                            image_filename = self.steam_manager.download_image(
                                steam_data_img['image_url'], item_name
                            )
                            self.db_manager.update_item(item_id, image_filename=image_filename)
                            item_db = self.db_manager.get_item(item_name, source_row=source_row)
                            if item_db:
                                item_id, db_source_row, name, quantity, purchase_price, current_price, image_filename, steam_item_id, steam_market_url, steam_sale_fee, last_update, created_at = item_db

                    if steam_item_id:
                        # Buscar preço atual
                        new_price = self.steam_manager.get_item_price(steam_item_id)

                        if new_price is None:
                            steam_data = self.steam_manager.search_item_on_steam(item_name)
                            resolved_id = steam_data.get("steam_id") if steam_data else None
                            if resolved_id and resolved_id != steam_item_id:
                                self.db_manager.update_item(
                                    item_id,
                                    steam_item_id=resolved_id,
                                    steam_market_url=steam_data.get("market_url")
                                )
                                steam_item_id = resolved_id
                                new_price = self.steam_manager.get_item_price(steam_item_id)
                        
                        if new_price is not None:
                            self._aplicar_preco_atualizado(item_id, source_row, item_name, new_price)
                            self.carregar_cards()  # Recarregar cards para mostrar atualização
                        else:
                            self.log_na_ui(f"⚠️ Sem preço/última venda, valor antigo mantido: {item_name}", "ERROR")
                    else:
                        self.log_na_ui(f"⚠️ Item não encontrado na Steam: {item_name}", "ERROR")
                else:
                    self.log_na_ui(f"❌ Item não encontrado: {item_name}", "ERROR")
                    
            except SteamRateLimitError:
                self.log_na_ui("⚠️ Steam limitou as consultas. Tente novamente em alguns minutos.", "ERROR")
            except Exception as e:
                self.log_manager.log_error(str(e), f"atualizar_preco_item: {item_name}")
                self.log_na_ui(f"❌ Erro ao atualizar: {str(e)}", "ERROR")
        
        # Executar em thread separada para não travar a UI
        thread = threading.Thread(target=atualizar, daemon=True)
        thread.start()

if __name__ == "__main__":
    root = ctk.CTk()
    app = InventarioSistema(root)
    root.mainloop()
