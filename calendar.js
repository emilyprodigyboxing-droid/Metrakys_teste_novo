import { supabase } from "./supabase-client.js";

(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const pad = number => String(number).padStart(2, "0");
  const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parseDate = value => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  };
  const shiftDate = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  const todayKey = () => dateKey(new Date());
  const normalized = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-PT").trim();
  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const shortDate = value => new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", year: "numeric" }).format(parseDate(value));
  const longDate = value => new Intl.DateTimeFormat("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(parseDate(value));

  const palette = [
    { accent: "#4b82b3", background: "#eaf3fa", ink: "#37638a" },
    { accent: "#619887", background: "#eaf5f0", ink: "#467568" },
    { accent: "#987dad", background: "#f3eef8", ink: "#765b89" },
    { accent: "#b28a60", background: "#f8f2e9", ink: "#886a48" },
    { accent: "#bd7e81", background: "#faeeee", ink: "#945e62" },
    { accent: "#6d95a2", background: "#eaf4f5", ink: "#4c7581" }
  ];
  const employeeColors = new Map();
  const state = {
    userId: null,
    role: null,
    fullname: "",
    employees: [],
    schedules: [],
    displayedMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    view: "month",
    saving: false,
    pendingCreate: null,
    editingId: null,
    detailId: null
  };

  function setAppStatus(message, isError = false) {
    $("appStatusText").textContent = message;
    $("appStatus").hidden = !message;
    $("appStatus").classList.toggle("error", isError);
  }

  function employeeStyle(names) {
    const key = normalized(names.join(" "));
    if (!employeeColors.has(key)) {
      let hash = 0;
      for (const char of key) hash = ((hash * 31) + char.codePointAt(0)) >>> 0;
      let index = hash % palette.length;
      const used = new Set(employeeColors.values());
      if (used.size < palette.length) while (used.has(index)) index = (index + 1) % palette.length;
      employeeColors.set(key, index);
    }
    const color = palette[employeeColors.get(key)];
    return `--event-accent:${color.accent};--event-bg:${color.background};--event-ink:${color.ink}`;
  }

  function displayEmployees(event) {
    return event.employeeNames.length ? event.employeeNames.join(", ") : "Sem funcionários atribuídos";
  }

  function dateRange(event) {
    return event.startDate === event.endDate
      ? shortDate(event.startDate)
      : `${shortDate(event.startDate)} – ${shortDate(event.endDate)}`;
  }

  function sortEvents(a, b) {
    return a.startDate.localeCompare(b.startDate) ||
      (a.startTime || "").localeCompare(b.startTime || "") ||
      displayEmployees(a).localeCompare(displayEmployees(b), "pt-PT") ||
      a.id.localeCompare(b.id);
  }

  function eventStatus(event) {
    if (event.status === "cancelled") return { text: "Cancelada", className: "cancelled" };
    if (event.status !== "active") return { text: event.status || "Inativa", className: "inactive" };
    const now = new Date();
    const today = todayKey();
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    if (event.endDate < today || (!event.allDay && event.endDate === today && event.endTime < time)) {
      return { text: "Concluída", className: "past" };
    }
    if (event.startDate < today || (event.startDate === today && (event.allDay || event.startTime <= time))) {
      return { text: "Em curso", className: "ongoing" };
    }
    return { text: "Programada", className: "" };
  }

  function filteredSchedules() {
    const query = normalized($("searchEmployee").value);
    const employeeId = $("employeeFilter").value;
    const title = normalized($("searchTitle").value);
    return state.schedules.filter(event =>
      (!query || event.employeeNames.some(name => normalized(name).includes(query))) &&
      (!employeeId || event.employeeIds.includes(employeeId)) &&
      (!title || normalized(event.title).includes(title))
    ).sort(sortEvents);
  }

  function updateEmployees() {
    const selected = $("employeeFilter").value;
    const employees = [...state.employees].sort((a, b) => a.fullname.localeCompare(b.fullname, "pt-PT"));
    $("employeeFilter").innerHTML = '<option value="">Todos os funcionários</option>' +
      employees.map(employee => `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.fullname)}</option>`).join("");
    $("employeeFilter").value = employees.some(employee => employee.id === selected) ? selected : "";
  }

  function populateAssignmentOptions(selectedIds = []) {
    const select = $("scheduleForm").elements.employeeIds;
    const selected = new Set(selectedIds);
    const activeIds = new Set(state.employees.map(employee => employee.id));
    const activeOptions = state.employees.map(employee =>
      `<option value="${escapeHtml(employee.id)}"${selected.has(employee.id) ? " selected" : ""}>${escapeHtml(employee.fullname)}</option>`
    );
    const unavailableOptions = [...selected].filter(id => !activeIds.has(id)).map(id =>
      `<option value="${escapeHtml(id)}" selected disabled>Funcionário inativo ou indisponível (${escapeHtml(id.slice(0, 8))})</option>`
    );
    select.innerHTML = activeOptions.concat(unavailableOptions).join("");
  }

  function scheduleCard(event) {
    const status = eventStatus(event);
    const cancelled = event.status === "cancelled";
    return `<button type="button" class="schedule-card${cancelled ? " cancelled-event" : ""}" data-event-id="${escapeHtml(event.id)}" style="${employeeStyle(event.employeeNames)}">
      <span class="schedule-top"><span class="employee-label"><span class="employee-dot"></span>${escapeHtml(displayEmployees(event))}</span><span class="status-badge ${status.className}">${escapeHtml(status.text)}</span></span>
      <h3>${escapeHtml(event.title)}</h3>
      <span class="schedule-meta"><span>${escapeHtml(event.location || "Local não indicado")}</span><span>${escapeHtml(dateRange(event))}</span></span>
    </button>`;
  }

  function renderList(element, events, emptyMessage) {
    element.innerHTML = events.length
      ? events.map(scheduleCard).join("")
      : `<p class="empty-state">${escapeHtml(emptyMessage)}</p>`;
  }

  function renderMonth(events) {
    const first = new Date(state.displayedMonth.getFullYear(), state.displayedMonth.getMonth(), 1);
    const firstVisible = shiftDate(first, -((first.getDay() + 6) % 7));
    const today = todayKey();
    const days = [];
    for (let index = 0; index < 42; index++) {
      const date = shiftDate(firstVisible, index);
      const key = dateKey(date);
      const dayEvents = events.filter(event => event.startDate <= key && event.endDate >= key);
      const chips = dayEvents.slice(0, 2).map(event => {
        const before = event.startDate < key && index % 7 !== 0;
        const after = event.endDate > key && index % 7 !== 6;
        const cancelled = event.status === "cancelled";
        const description = `${displayEmployees(event)}: ${event.title}${event.location ? ` · ${event.location}` : ""}`;
        return `<button type="button" class="event-chip${before ? " continues-before" : ""}${after ? " continues-after" : ""}${cancelled ? " cancelled-event" : ""}" data-event-id="${escapeHtml(event.id)}" style="${employeeStyle(event.employeeNames)}" aria-label="${escapeHtml(description)}"><strong>${escapeHtml(displayEmployees(event))}</strong><span>${escapeHtml(event.title)}${event.location ? ` · ${escapeHtml(event.location)}` : ""}</span></button>`;
      }).join("");
      const more = dayEvents.length > 2 ? `<button type="button" class="more-events" data-day="${key}">+ ${dayEvents.length - 2} mais</button>` : "";
      days.push(`<div class="day-cell${date.getMonth() !== state.displayedMonth.getMonth() ? " outside" : ""}${key === today ? " today-cell" : ""}" data-cell-day="${key}">
        <button type="button" class="day-number" data-day="${key}" aria-label="${escapeHtml(longDate(key))}${key === today ? ", hoje" : ""}">${date.getDate()}</button>${chips}${more}</div>`);
    }
    $("calendarGrid").innerHTML = days.join("");
  }

  function render() {
    const events = filteredSchedules();
    $("monthTitle").textContent = new Intl.DateTimeFormat("pt-PT", { month: "long", year: "numeric" }).format(state.displayedMonth);
    $("monthView").hidden = state.view !== "month";
    $("agendaView").hidden = state.view !== "agenda";
    $("viewSelect").value = state.view;
    document.querySelectorAll(".navigation [data-view]").forEach(button => {
      const active = button.dataset.view === state.view;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    renderMonth(events);
    const first = dateKey(state.displayedMonth);
    const last = dateKey(new Date(state.displayedMonth.getFullYear(), state.displayedMonth.getMonth() + 1, 0));
    const monthEvents = events.filter(event => event.startDate <= last && event.endDate >= first);
    $("agendaCount").textContent = `${monthEvents.length} ${monthEvents.length === 1 ? "programação" : "programações"}`;
    renderList($("agendaList"), monthEvents, "Não há programações neste mês para os filtros selecionados.");
    renderList($("upcomingList"), events.filter(event =>
      event.status === "active" && eventStatus(event).className !== "past"
    ), "Não há próximas programações para os filtros selecionados.");
  }

  function setView(nextView) {
    state.view = nextView;
    render();
  }

  function resetFilters() {
    $("searchEmployee").value = "";
    $("employeeFilter").value = "";
    $("searchTitle").value = "";
  }

  function openDay(day) {
    const events = filteredSchedules().filter(event => event.startDate <= day && event.endDate >= day);
    $("dayTitle").textContent = longDate(day);
    renderList($("dayList"), events, "Não há programações neste dia para os filtros selecionados.");
    $("dayDialog").showModal();
  }

  function detailRow(label, value) {
    return `<div class="detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  }

  function openDetails(id) {
    const event = state.schedules.find(item => item.id === id);
    if (!event) return;
    if ($("dayDialog").open) $("dayDialog").close();
    state.detailId = event.id;
    $("detailsTitle").textContent = event.title;
    $("detailsSource").textContent = event.status === "cancelled" ? "Programação cancelada" : "Programação da equipa";
    const status = eventStatus(event).text;
    const time = event.allDay ? "Dia inteiro" : `${event.startTime} – ${event.endTime}`;
    $("detailsContent").innerHTML = `<dl class="details-content">
      ${detailRow("Funcionários", displayEmployees(event))}
      ${detailRow("Estado", status)}
      ${detailRow("Local", event.location || "Não indicado")}
      ${detailRow("Início", shortDate(event.startDate))}
      ${detailRow("Fim", shortDate(event.endDate))}
      ${detailRow("Horário", time)}
      ${detailRow("Observações", event.description || "Sem observações")}
    </dl>`;
    const canManage = state.role === "admin" && event.status === "active";
    $("editSchedule").hidden = !canManage;
    $("cancelSchedule").hidden = !canManage;
    $("detailsDialog").showModal();
  }

  function updateTimeFields() {
    const allDay = $("scheduleForm").elements.allDay.checked;
    document.querySelectorAll(".time-field").forEach(field => {
      field.hidden = allDay;
      field.querySelector("input").required = !allDay;
    });
  }

  function setFormValues(record, employeeIds) {
    const form = $("scheduleForm");
    form.reset();
    form.elements.title.value = record.title || "";
    form.elements.location.value = record.location || "";
    form.elements.startDate.value = record.startDate || todayKey();
    form.elements.endDate.value = record.endDate || record.startDate || todayKey();
    form.elements.startTime.value = record.startTime || "";
    form.elements.endTime.value = record.endTime || "";
    form.elements.allDay.checked = record.allDay !== false;
    form.elements.description.value = record.description || "";
    populateAssignmentOptions(employeeIds);
    updateTimeFields();
    $("formError").textContent = "";
  }

  function updateSaveButton() {
    const button = $("saveScheduleButton");
    button.textContent = state.pendingCreate ? "Repetir atribuição" : (state.editingId ? "Guardar alterações" : "Criar programação");
  }

  function openNewSchedule() {
    state.editingId = null;
    $("scheduleDialogTitle").textContent = state.pendingCreate ? "Atribuições pendentes" : "Criar programação";
    $("scheduleDialogDescription").textContent = state.pendingCreate
      ? `A programação ${state.pendingCreate.id} existe. Repita ou ajuste a atribuição dos funcionários.`
      : "A programação será guardada na equipa.";
    const record = state.pendingCreate ? state.pendingCreate.record : {
      startDate: todayKey(), endDate: todayKey(), allDay: true
    };
    setFormValues(record, state.pendingCreate ? state.pendingCreate.employeeIds : []);
    updateSaveButton();
    $("scheduleDialog").showModal();
  }

  function openEditSchedule() {
    const event = state.schedules.find(item => item.id === state.detailId);
    if (!event || event.status !== "active" || state.role !== "admin") return;
    $("detailsDialog").close();
    state.editingId = event.id;
    $("scheduleDialogTitle").textContent = "Editar programação";
    $("scheduleDialogDescription").textContent = "As alterações serão guardadas na programação da equipa.";
    setFormValues(event, event.employeeIds);
    updateSaveButton();
    $("scheduleDialog").showModal();
  }

  function readForm(form) {
    const employeeIds = [...form.elements.employeeIds.selectedOptions].map(option => option.value);
    return {
      title: form.elements.title.value.trim(),
      description: form.elements.description.value.trim(),
      location: form.elements.location.value.trim(),
      startDate: form.elements.startDate.value,
      endDate: form.elements.endDate.value,
      startTime: form.elements.startTime.value,
      endTime: form.elements.endTime.value,
      allDay: form.elements.allDay.checked,
      employeeIds
    };
  }

  function validateForm(values) {
    if (!values.title) return "Indique o título da programação.";
    if (!values.startDate || !values.endDate) return "Indique as datas de início e de fim.";
    if (values.endDate < values.startDate) return "A data de fim não pode ser anterior à data de início.";
    if (values.allDay) return "";
    if (!values.startTime || !values.endTime) return "Indique as horas de início e de fim.";
    const start = new Date(`${values.startDate}T${values.startTime}:00`);
    const end = new Date(`${values.endDate}T${values.endTime}:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return "A data e hora de fim têm de ser posteriores à data e hora de início.";
    }
    return "";
  }

  function toTimestamp(date, time, allDay, endOfDay = false) {
    if (allDay) return `${date}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`;
    return new Date(`${date}T${time}:00`).toISOString();
  }

  function scheduleValues(values) {
    return {
      title: values.title,
      description: values.description || null,
      location: values.location || null,
      starts_at: toTimestamp(values.startDate, values.startTime, values.allDay),
      ends_at: toTimestamp(values.endDate, values.endTime, values.allDay, values.allDay),
      all_day: values.allDay
    };
  }

  async function reconcileAssignments(scheduleId, desiredEmployeeIds) {
    const { data: current, error: readError } = await supabase
      .from("employee_schedule_assignments")
      .select("employee_id")
      .eq("schedule_id", scheduleId);
    if (readError) throw readError;

    const existingIds = new Set((current || []).map(item => item.employee_id));
    const desiredIds = new Set(desiredEmployeeIds);
    const additions = [...desiredIds].filter(id => !existingIds.has(id));
    const removals = [...existingIds].filter(id => !desiredIds.has(id));

    if (additions.length) {
      const assignedAt = new Date().toISOString();
      const { error } = await supabase.from("employee_schedule_assignments").insert(
        additions.map(employeeId => ({ schedule_id: scheduleId, employee_id: employeeId, assigned_at: assignedAt }))
      );
      if (error) throw error;
    }
    if (removals.length) {
      const { error } = await supabase.from("employee_schedule_assignments")
        .delete().eq("schedule_id", scheduleId).in("employee_id", removals);
      if (error) throw error;
    }
  }

  function formError(message) {
    $("formError").textContent = message;
  }

  async function refreshAfterWrite() {
    try {
      await loadSchedules();
      return true;
    } catch (error) {
      console.error("Calendar refresh after write failed:", error);
      setAppStatus("A operação foi confirmada, mas não foi possível atualizar o calendário. Atualize a página ou tente novamente.", true);
      return false;
    }
  }

  async function submitSchedule(form) {
    if (state.saving || state.role !== "admin") return;
    const values = readForm(form);
    const validationError = validateForm(values);
    if (validationError) {
      formError(validationError);
      return;
    }

    state.saving = true;
    $("saveScheduleButton").disabled = true;
    formError("");
    try {
      if (state.pendingCreate) {
        state.pendingCreate.employeeIds = values.employeeIds;
        try {
          await reconcileAssignments(state.pendingCreate.id, values.employeeIds);
        } catch (error) {
          console.error("Calendar assignment retry failed:", error);
          formError(`A programação ${state.pendingCreate.id} continua criada, mas as atribuições não foram concluídas. Verifique as permissões e tente novamente. ${error.message || ""}`);
          return;
        }
        state.pendingCreate = null;
        await refreshAfterWrite();
        $("scheduleDialog").close();
        $("announcement").textContent = "A programação e as atribuições foram guardadas.";
        return;
      }

      if (state.editingId) {
        const scheduleId = state.editingId;
        const { data, error } = await supabase.from("employee_schedules")
          .update(scheduleValues(values))
          .eq("id", scheduleId)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("A programação não foi encontrada ou não pode ser editada.");
        try {
          await reconcileAssignments(scheduleId, values.employeeIds);
        } catch (error) {
          console.error("Calendar assignment update failed:", error);
          formError(`Os campos da programação foram atualizados, mas as atribuições não foram concluídas. Repita Guardar alterações para reconciliar os funcionários. ${error.message || ""}`);
          return;
        }
        await refreshAfterWrite();
        $("scheduleDialog").close();
        state.editingId = null;
        $("announcement").textContent = "Programação atualizada.";
        return;
      }

      const { data, error } = await supabase.from("employee_schedules")
        .insert({ ...scheduleValues(values), created_by: state.userId, status: "active" })
        .select("id")
        .single();
      if (error) throw error;
      if (!data?.id) throw new Error("A Supabase não devolveu o ID da programação criada.");

      state.pendingCreate = { id: String(data.id), record: values, employeeIds: values.employeeIds };
      try {
        await reconcileAssignments(state.pendingCreate.id, values.employeeIds);
      } catch (error) {
        console.error("Calendar assignment insert failed:", error);
        $("scheduleDialogTitle").textContent = "Atribuições pendentes";
        $("scheduleDialogDescription").textContent = `A programação ${state.pendingCreate.id} existe. Repita ou ajuste a atribuição dos funcionários.`;
        updateSaveButton();
        formError(`A programação foi criada com o ID ${state.pendingCreate.id}, mas não foi possível guardar os funcionários. A gravação está incompleta. Tente novamente. ${error.message || ""}`);
        return;
      }
      state.pendingCreate = null;
      await refreshAfterWrite();
      $("scheduleDialog").close();
      $("announcement").textContent = "Programação criada e funcionários atribuídos.";
    } catch (error) {
      console.error("Calendar schedule save failed:", error);
      formError(`Não foi possível guardar a programação. ${error.message || "Verifique a ligação e tente novamente."}`);
    } finally {
      state.saving = false;
      $("saveScheduleButton").disabled = false;
      updateSaveButton();
    }
  }

  async function cancelCurrentSchedule() {
    if (state.role !== "admin" || !state.detailId) return;
    const event = state.schedules.find(item => item.id === state.detailId);
    if (!event || event.status !== "active") return;
    if (!window.confirm(`Pretende cancelar a programação "${event.title}"? Esta ação não apaga o registo.`)) return;
    $("cancelSchedule").disabled = true;
    try {
      const { data, error } = await supabase.from("employee_schedules")
        .update({ status: "cancelled" })
        .eq("id", event.id)
        .select("id, status")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("A programação não foi encontrada ou não pode ser cancelada.");
      await refreshAfterWrite();
      $("detailsDialog").close();
      $("announcement").textContent = "Programação cancelada.";
    } catch (error) {
      console.error("Calendar schedule cancellation failed:", error);
      setAppStatus(`Não foi possível cancelar a programação. ${error.message || "Verifique as permissões e tente novamente."}`, true);
    } finally {
      $("cancelSchedule").disabled = false;
    }
  }

  function fromDatabaseDate(value, allDay) {
    return allDay ? String(value).slice(0, 10) : dateKey(new Date(value));
  }

  function fromDatabaseTime(value, allDay) {
    if (allDay) return "";
    const date = new Date(value);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  async function loadSchedules() {
    setAppStatus("A carregar programações reais...");
    const employeeQuery = state.role === "admin"
      ? supabase.from("employee_profiles").select("id, fullname").eq("active", true).order("fullname")
      : Promise.resolve({ data: [{ id: state.userId, fullname: state.fullname }], error: null });
    const [{ data: employeeData, error: employeeError }, schedulesResult] = await Promise.all([
      employeeQuery,
      state.role === "admin"
        ? supabase.from("employee_schedules")
          .select("id, created_by, title, description, location, starts_at, ends_at, all_day, status, created_at, updated_at, revision")
          .order("starts_at")
        : Promise.resolve(null)
    ]);
    if (employeeError) throw employeeError;
    if (state.role === "admin" && schedulesResult.error) throw schedulesResult.error;

    let rows;
    let scheduleIds;
    if (state.role === "admin") {
      rows = schedulesResult.data || [];
      scheduleIds = rows.map(row => row.id);
    } else {
      const { data: assignments, error: assignmentError } = await supabase.from("employee_schedule_assignments")
        .select("schedule_id, employee_id")
        .eq("employee_id", state.userId);
      if (assignmentError) throw assignmentError;
      scheduleIds = [...new Set((assignments || []).map(item => item.schedule_id))];
      if (!scheduleIds.length) {
        state.employees = employeeData || [];
        state.schedules = [];
        updateEmployees();
        render();
        setAppStatus("");
        return;
      }
      const { data, error } = await supabase.from("employee_schedules")
        .select("id, created_by, title, description, location, starts_at, ends_at, all_day, status, created_at, updated_at, revision")
        .in("id", scheduleIds)
        .order("starts_at");
      if (error) throw error;
      rows = data || [];
    }

    const assignments = scheduleIds.length
      ? await supabase.from("employee_schedule_assignments")
        .select("schedule_id, employee_id")
        .in("schedule_id", scheduleIds)
      : { data: [], error: null };
    if (assignments.error) throw assignments.error;

    const employees = employeeData || [];
    const employeeById = new Map(employees.map(employee => [employee.id, employee.fullname]));
    const employeeIdsBySchedule = new Map();
    for (const assignment of assignments.data || []) {
      if (!employeeIdsBySchedule.has(assignment.schedule_id)) employeeIdsBySchedule.set(assignment.schedule_id, []);
      employeeIdsBySchedule.get(assignment.schedule_id).push(assignment.employee_id);
    }
    state.employees = employees;
    state.schedules = (rows || []).map(row => {
      const allDay = Boolean(row.all_day);
      const employeeIds = employeeIdsBySchedule.get(row.id) || [];
      const employeeNames = employeeIds.map(id => employeeById.get(id) || `Funcionário indisponível (${String(id).slice(0, 8)})`);
      return {
        id: String(row.id),
        title: row.title || "",
        description: row.description || "",
        location: row.location || "",
        startDate: fromDatabaseDate(row.starts_at, allDay),
        endDate: fromDatabaseDate(row.ends_at, allDay),
        startTime: fromDatabaseTime(row.starts_at, allDay),
        endTime: fromDatabaseTime(row.ends_at, allDay),
        allDay,
        status: row.status || "",
        employeeIds,
        employeeNames
      };
    });
    updateEmployees();
    render();
    setAppStatus("");
  }

  function denyAccess(message) {
    $("app").hidden = true;
    $("accessState").textContent = message;
    $("accessState").hidden = false;
  }

  async function initialize() {
    let sessionData;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      sessionData = data;
    } catch (error) {
      console.error("Calendar session verification failed:", error);
      denyAccess(`Não foi possível validar a sessão. ${error.message || "Tente novamente através do acesso do sistema."}`);
      return;
    }

    if (!sessionData.session?.user?.id) {
      window.location.replace("./index.html");
      return;
    }

    state.userId = sessionData.session.user.id;
    let profile;
    try {
      const result = await supabase.from("employee_profiles")
        .select("id, fullname, role, active")
        .eq("id", state.userId)
        .maybeSingle();
      if (result.error) throw result.error;
      profile = result.data;
    } catch (error) {
      console.error("Calendar profile verification failed:", error);
      denyAccess(`Não foi possível validar o perfil do utilizador. ${error.message || "Acesso bloqueado."}`);
      return;
    }

    if (!profile || profile.id !== state.userId || profile.active !== true ||
        !["admin", "metrologist"].includes(profile.role)) {
      denyAccess("Acesso bloqueado: o perfil não existe, está inativo ou não tem uma função autorizada.");
      return;
    }

    state.role = profile.role;
    state.fullname = profile.fullname || "Funcionário";
    $("sidebarName").textContent = state.fullname;
    $("sidebarRole").textContent = profile.role === "admin" ? "Administrador" : "Metrologista";
    $("newSchedule").hidden = profile.role !== "admin";
    try {
      await loadSchedules();
    } catch (error) {
      console.error("Calendar schedule loading failed:", error);
      setAppStatus(`Não foi possível carregar as programações. ${error.message || "Verifique a ligação e tente novamente."}`, true);
    }
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      window.location.replace("./index.html");
    } else if (state.userId && session.user.id !== state.userId) {
      window.location.reload();
    }
  });

  $("previousMonth").addEventListener("click", () => {
    state.displayedMonth = new Date(state.displayedMonth.getFullYear(), state.displayedMonth.getMonth() - 1, 1);
    render();
  });
  $("nextMonth").addEventListener("click", () => {
    state.displayedMonth = new Date(state.displayedMonth.getFullYear(), state.displayedMonth.getMonth() + 1, 1);
    render();
  });
  $("today").addEventListener("click", () => {
    const date = new Date();
    state.displayedMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    render();
  });
  $("viewSelect").addEventListener("change", event => setView(event.target.value));
  document.querySelectorAll(".navigation [data-view]").forEach(button => button.addEventListener("click", () => {
    setView(button.dataset.view);
    $("calendarSection").scrollIntoView({ block: "start", behavior: "smooth" });
  }));
  ["searchEmployee", "employeeFilter", "searchTitle"].forEach(id =>
    $(id).addEventListener(id === "employeeFilter" ? "change" : "input", render)
  );
  $("clearFilters").addEventListener("click", () => { resetFilters(); render(); });
  $("newSchedule").addEventListener("click", openNewSchedule);
  $("scheduleForm").elements.allDay.addEventListener("change", updateTimeFields);
  $("scheduleForm").addEventListener("submit", event => {
    event.preventDefault();
    submitSchedule(event.currentTarget);
  });
  $("editSchedule").addEventListener("click", openEditSchedule);
  $("cancelSchedule").addEventListener("click", cancelCurrentSchedule);

  document.addEventListener("click", event => {
    const close = event.target.closest("[data-close]");
    if (close) { close.closest("dialog").close(); return; }
    const eventButton = event.target.closest("[data-event-id]");
    if (eventButton) { openDetails(eventButton.dataset.eventId); return; }
    const dayButton = event.target.closest("[data-day]");
    if (dayButton) { openDay(dayButton.dataset.day); return; }
    const cell = event.target.closest("[data-cell-day]");
    if (cell) openDay(cell.dataset.cellDay);
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const dialog = document.querySelector("dialog:modal");
    if (dialog) { event.preventDefault(); dialog.close(); }
  });

  initialize();
})();
