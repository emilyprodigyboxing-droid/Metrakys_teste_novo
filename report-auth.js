
import {
  supabase,
  getEmployeeProfile,
  getActiveEmployees,
  getSignatureUrl
} from "./supabase-client.js";

const employeeSignatures = {};

function updateField(id, value) {
  const field = document.getElementById(id);

  if (!field) return;

  field.value = value || "";
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function createEmployeeSelect(inputId, employees) {
  const input = document.getElementById(inputId);

  if (!input) return null;

  input.readOnly = true;

  const select = document.createElement("select");
  select.className = input.className;
  select.style.marginTop = "7px";

  const firstOption = document.createElement("option");
  firstOption.value = "";
  firstOption.textContent = "Seleccionar empleado...";
  select.appendChild(firstOption);

  employees.forEach(employee => {
    const option = document.createElement("option");

    option.value = employee.id;
    option.textContent = employee.fullname;

    select.appendChild(option);
  });

  input.insertAdjacentElement("afterend", select);

  select.addEventListener("change", () => {
    const employee = employees.find(
      item => item.id === select.value
    );

    if (!employee) {
      updateField(inputId, "");
      return;
    }

    updateField(inputId, employee.fullname);
  });

  return select;
}

function addSignatureToPreview() {
  const signatures = document.querySelectorAll(
    "#paper .signatures .sig"
  );

  const measuredSignature = signatures[0];

  if (!measuredSignature || !employeeSignatures.measured) return;

  if (measuredSignature.querySelector(".employee-signature")) return;

  const image = document.createElement("img");

  image.src = employeeSignatures.measured;
  image.alt = "Firma del metrólogo";
  image.className = "employee-signature";

  image.style.display = "block";
  image.style.maxWidth = "150px";
  image.style.maxHeight = "65px";
  image.style.objectFit = "contain";
  image.style.margin = "8px auto";

  measuredSignature.appendChild(image);
}

async function initializeReportAuthentication() {
  try {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) throw sessionError;

    const session = sessionData.session;

    if (!session) {
      window.location.replace("./index.html");
      return;
    }

    const employee = await getEmployeeProfile(session.user.id);

    if (!employee) {
      throw new Error(
        "No existe un perfil activo para este usuario."
      );
    }

    // Identificación automática del metrólogo.
    updateField("metrologist", employee.fullname);
    updateField("measuredBy", employee.fullname);

    document.getElementById("metrologist").readOnly = true;
    document.getElementById("measuredBy").readOnly = true;

    // Carregar assinatura do funcionário autenticado.
    if (employee.signature_path) {
      employeeSignatures.measured =
        await getSignatureUrl(employee.signature_path);
    }

    // Listar funcionários ativos.
    const employees = await getActiveEmployees();

    // Seleção de revisor/aprovador e modificador.
    createEmployeeSelect("approvedBy", employees);
    createEmployeeSelect("modifiedBy", employees);

    // Observar atualizações da pré-visualização.
    const paper = document.getElementById("paper");

    if (paper) {
      const observer = new MutationObserver(() => {
        addSignatureToPreview();
      });

      observer.observe(paper, {
        childList: true,
        subtree: true
      });

      addSignatureToPreview();
    }

    console.log("Funcionário autenticado:", employee.fullname);

  } catch (error) {
    console.error("Erro na integração do informe:", error);
    alert("Erro ao carregar os dados do funcionário: " + error.message);
  }
}

initializeReportAuthentication();
