"""Read the Windows ACL, to prove the privacy the runtime relies on.

POSIX job storage is private because the runtime *creates* it that way:
`secure_paths.mkdir_at` passes `mode=0o700` and the guards verify those bits
later. The question this module exists to answer is whether anything equivalent
holds on Windows, where `os.mkdir`'s mode was assumed to be ignored.

Measured on Windows 11 with CPython 3.14, under a workspace deliberately
granting the local Users group (S-1-5-32-545) read, listing every principal
other than us, SYSTEM and Administrators:

    workspace (widened)      S-1-5-32-545
    directory, no mode       S-1-5-32-545      inherits it
    directory, mode 0o700    none              the mode IS translated
    directory, mode 0o755    S-1-5-32-545
    file, mode 0o600         S-1-5-32-545      the mode is NOT translated
    file inside the 0o700    none              inherits the restriction

So the protection already exists and `mkdir_at`'s default mode establishes it,
the same way it does on POSIX. No ACL is written by this project; doing so would
duplicate what the platform already did, and a primitive whose job is to open or
close permissions is a liability to keep around unused.

Two consequences worth holding on to. It rests on a CPython behaviour that
nothing else here pins, so `tests/unit_tests/test_windows_acl_job_storage.py`
pins it: if a future Python stops translating the mode, job storage silently
becomes readable by every local user. And a file's own mode buys nothing on
Windows -- privacy comes from its directory -- so code that needs a private file
must create the directory it lives in rather than trust the open mode.

Nothing here writes, signals, elevates, or touches anything outside the path it
is given, and on POSIX every entry point is inert.
"""

from __future__ import annotations

import os

HAS_ACL = os.name == "nt"

# Principals that can read anything on the machine regardless of any DACL, so
# treating them as a breach would be theatre. SYSTEM, the Administrators group,
# and the owner-rights placeholder, which resolves to whoever owns the object
# and is therefore checked through the owner instead.
SYSTEM_SID = "S-1-5-18"
ADMINISTRATORS_SID = "S-1-5-32-544"
OWNER_RIGHTS_SID = "S-1-3-4"
ALWAYS_ALLOWED = frozenset({SYSTEM_SID, ADMINISTRATORS_SID, OWNER_RIGHTS_SID})

if HAS_ACL:  # pragma: no cover - exercised only on Windows
    import ctypes
    from ctypes import wintypes

    _advapi32 = ctypes.WinDLL("advapi32", use_last_error=True)
    _kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    _SE_FILE_OBJECT = 1
    _OWNER_SECURITY_INFORMATION = 0x00000001
    _DACL_SECURITY_INFORMATION = 0x00000004
    _PROTECTED_DACL_SECURITY_INFORMATION = 0x80000000
    _SDDL_REVISION_1 = 1
    _ACL_SIZE_INFORMATION = 2
    _ACCESS_ALLOWED_ACE_TYPE = 0
    _TOKEN_QUERY = 0x0008
    _TOKEN_USER = 1
    _PVOID = ctypes.c_void_p

    class _AclSizeInformation(ctypes.Structure):
        _fields_ = [
            ("AceCount", wintypes.DWORD),
            ("AclBytesInUse", wintypes.DWORD),
            ("AclBytesFree", wintypes.DWORD),
        ]

    class _AceHeader(ctypes.Structure):
        _fields_ = [
            ("AceType", ctypes.c_ubyte),
            ("AceFlags", ctypes.c_ubyte),
            ("AceSize", wintypes.WORD),
        ]

    class _AccessAllowedAce(ctypes.Structure):
        _fields_ = [
            ("Header", _AceHeader),
            ("Mask", wintypes.DWORD),
            ("SidStart", wintypes.DWORD),
        ]

    class _SidAndAttributes(ctypes.Structure):
        _fields_ = [("Sid", _PVOID), ("Attributes", wintypes.DWORD)]

    class _TokenUser(ctypes.Structure):
        _fields_ = [("User", _SidAndAttributes)]

    # Every signature is declared. Left implicit, GetCurrentProcess's
    # (HANDLE)-1 is taken for a C int and truncated on the way into
    # OpenProcessToken, which then fails with ERROR_INVALID_HANDLE. That was
    # measured here, not guessed at.
    _kernel32.GetCurrentProcess.restype = wintypes.HANDLE
    _kernel32.GetCurrentProcess.argtypes = []
    _kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    _kernel32.LocalFree.argtypes = [_PVOID]
    _kernel32.LocalFree.restype = _PVOID
    _advapi32.OpenProcessToken.argtypes = [
        wintypes.HANDLE,
        wintypes.DWORD,
        ctypes.POINTER(wintypes.HANDLE),
    ]
    _advapi32.OpenProcessToken.restype = wintypes.BOOL
    _advapi32.GetTokenInformation.argtypes = [
        wintypes.HANDLE,
        ctypes.c_int,
        _PVOID,
        wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD),
    ]
    _advapi32.GetTokenInformation.restype = wintypes.BOOL
    _advapi32.ConvertSidToStringSidW.argtypes = [
        _PVOID,
        ctypes.POINTER(ctypes.c_wchar_p),
    ]
    _advapi32.ConvertSidToStringSidW.restype = wintypes.BOOL
    _advapi32.ConvertStringSecurityDescriptorToSecurityDescriptorW.argtypes = [
        wintypes.LPCWSTR,
        wintypes.DWORD,
        ctypes.POINTER(_PVOID),
        ctypes.POINTER(wintypes.DWORD),
    ]
    _advapi32.ConvertStringSecurityDescriptorToSecurityDescriptorW.restype = (
        wintypes.BOOL
    )
    _advapi32.GetSecurityDescriptorDacl.argtypes = [
        _PVOID,
        ctypes.POINTER(wintypes.BOOL),
        ctypes.POINTER(_PVOID),
        ctypes.POINTER(wintypes.BOOL),
    ]
    _advapi32.GetSecurityDescriptorDacl.restype = wintypes.BOOL
    _advapi32.SetNamedSecurityInfoW.argtypes = [
        wintypes.LPWSTR,
        ctypes.c_int,
        wintypes.DWORD,
        _PVOID,
        _PVOID,
        _PVOID,
        _PVOID,
    ]
    _advapi32.SetNamedSecurityInfoW.restype = wintypes.DWORD
    _advapi32.GetNamedSecurityInfoW.argtypes = [
        wintypes.LPCWSTR,
        ctypes.c_int,
        wintypes.DWORD,
        ctypes.POINTER(_PVOID),
        ctypes.POINTER(_PVOID),
        ctypes.POINTER(_PVOID),
        ctypes.POINTER(_PVOID),
        ctypes.POINTER(_PVOID),
    ]
    _advapi32.GetNamedSecurityInfoW.restype = wintypes.DWORD
    _advapi32.GetAclInformation.argtypes = [
        _PVOID,
        _PVOID,
        wintypes.DWORD,
        ctypes.c_int,
    ]
    _advapi32.GetAclInformation.restype = wintypes.BOOL
    _advapi32.GetAce.argtypes = [_PVOID, wintypes.DWORD, ctypes.POINTER(_PVOID)]
    _advapi32.GetAce.restype = wintypes.BOOL

    def _sid_text(pointer) -> str:
        out = ctypes.c_wchar_p()
        if not _advapi32.ConvertSidToStringSidW(pointer, ctypes.byref(out)):
            raise OSError(ctypes.get_last_error(), "ConvertSidToStringSid failed")
        try:
            return str(out.value)
        finally:
            _kernel32.LocalFree(ctypes.cast(out, _PVOID))

    def current_user_sid() -> str:
        """The SID of the account this process runs as."""
        token = wintypes.HANDLE()
        if not _advapi32.OpenProcessToken(
            _kernel32.GetCurrentProcess(), _TOKEN_QUERY, ctypes.byref(token)
        ):
            raise OSError(ctypes.get_last_error(), "OpenProcessToken failed")
        try:
            size = wintypes.DWORD()
            _advapi32.GetTokenInformation(
                token, _TOKEN_USER, None, 0, ctypes.byref(size)
            )
            buffer = ctypes.create_string_buffer(size.value)
            if not _advapi32.GetTokenInformation(
                token, _TOKEN_USER, buffer, size, ctypes.byref(size)
            ):
                raise OSError(ctypes.get_last_error(), "GetTokenInformation failed")
            record = ctypes.cast(buffer, ctypes.POINTER(_TokenUser)).contents
            return _sid_text(record.User.Sid)
        finally:
            _kernel32.CloseHandle(token)

    def _owner_and_allowed(path) -> tuple[str, set[str]]:
        descriptor = _PVOID()
        dacl = _PVOID()
        owner = _PVOID()
        status = _advapi32.GetNamedSecurityInfoW(
            str(path),
            _SE_FILE_OBJECT,
            _OWNER_SECURITY_INFORMATION | _DACL_SECURITY_INFORMATION,
            ctypes.byref(owner),
            None,
            ctypes.byref(dacl),
            None,
            ctypes.byref(descriptor),
        )
        if status != 0:
            raise OSError(status, "GetNamedSecurityInfo failed")
        try:
            owner_sid = _sid_text(owner) if owner else ""
            if not dacl:
                # No DACL at all is not "no access"; it means everyone.
                return owner_sid, {"<null-dacl>"}
            size = _AclSizeInformation()
            if not _advapi32.GetAclInformation(
                dacl, ctypes.byref(size), ctypes.sizeof(size), _ACL_SIZE_INFORMATION
            ):
                raise OSError(ctypes.get_last_error(), "GetAclInformation failed")
            allowed: set[str] = set()
            for index in range(size.AceCount):
                ace = _PVOID()
                if not _advapi32.GetAce(dacl, index, ctypes.byref(ace)):
                    raise OSError(ctypes.get_last_error(), "GetAce failed")
                entry = ctypes.cast(ace, ctypes.POINTER(_AccessAllowedAce)).contents
                if entry.Header.AceType != _ACCESS_ALLOWED_ACE_TYPE:
                    continue
                allowed.add(
                    _sid_text(_PVOID(ace.value + _AccessAllowedAce.SidStart.offset))
                )
            return owner_sid, allowed
        finally:
            _kernel32.LocalFree(descriptor)

    def restricted_to_current_user(path) -> bool:
        """Whether only this user can reach ``path``.

        The owner must be us, because an owner-rights ACE grants to whoever
        owns the object, and every other allow ACE must name us or a principal
        that could read the object anyway.
        """
        try:
            owner, allowed = _owner_and_allowed(path)
        except OSError:
            return False
        me = current_user_sid()
        return owner == me and not (allowed - ALWAYS_ALLOWED - {me})

else:

    def current_user_sid() -> str:
        raise OSError("windows-only")

    def restricted_to_current_user(path) -> bool:
        """POSIX has no ACL to read; `private_mode_is_safe` is the guard."""
        return True
